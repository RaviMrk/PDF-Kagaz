import type { FileRow } from '@/db/schema';
import { isPdfNativeError, type PdfLock, type WorkspaceFile } from '@/services/native/pdfNative';
import { PdfToolError, isPdfToolError, throwIfCancelled } from '@/services/pdf/pdfErrors';

import type { ToolRoute } from '../limits';
import type { Translate } from '../outputNames';
import type { PhaseTimer } from '../phaseTimer';
import type { PdfToolRequest, ToolExtras, ToolRunDeps } from '../runTool';
import { toToolFailure } from '../toolFailure';
import type { ToolFailure } from '../toolJobRepo';

/** A failure already mapped to its code and input (thrown inside a run only). */
export class ToolRunFailure extends Error {
  constructor(
    readonly failure: ToolFailure,
    readonly inputIndex: number | null,
  ) {
    super(`tool failed: ${failure}`);
  }
}

/** Runs `fn`; any error but a cancellation becomes `failure` (null: mapped) at `inputIndex`. */
export async function as<T>(
  failure: ToolFailure | null,
  inputIndex: number | null,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ToolRunFailure || isPdfToolError(e, 'cancelled')) throw e;
    throw new ToolRunFailure(failure ?? toToolFailure(e), inputIndex);
  }
}

/**
 * Everything a PDF tool runner gets: its staged inputs (in request order, with their rows), the
 * route chosen from the staged sizes, and the job's publish / progress / native helpers.
 */
export type RunContext<R extends PdfToolRequest = PdfToolRequest> = {
  jobId: string;
  /** The job workspace (file:// directory); the job's own files go here. */
  workspace: string;
  request: R;
  rows: FileRow[];
  inputs: WorkspaceFile[];
  /** Each staged input's lock as inspected before unlocking (`inputs` are the decrypted copies). */
  locks: PdfLock[];
  route: ToolRoute;
  deps: ToolRunDeps;
  signal: AbortSignal;
  t: Translate;
  time: PhaseTimer['time'];
  processing(f: number): void;
  /** Writes `out` into the workspace, then publishes it (saving progress `from` → `to`). */
  save(out: { bytes: Uint8Array; name: string }, from: number, to: number): Promise<void>;
  /** Publishes a file already in the workspace (written by a native op). */
  publishFile(file: WorkspaceFile, name: string, from: number, to: number): Promise<void>;
  /**
   * Runs one native job op with progress, cancel and ERR_CANCELLED → cancelled. `range`: the op's
   * share of the processing progress (default all of it).
   */
  nativeOp<T>(fn: () => Promise<T>, range?: ProgressRange): Promise<T>;
  /** Pages written, for the release log. */
  setPages(n: number): void;
  /** Adds to the job's extras (earlier ones, like `passwordRemoved`, are kept). */
  setExtras(e: ToolExtras): void;
};

/** A share `from` → `to` (0..1) of a phase's progress. */
export type ProgressRange = { from: number; to: number };

export type ToolRunner<R extends PdfToolRequest = PdfToolRequest> = (
  ctx: RunContext<R>,
) => Promise<void>;

type NativeOpDeps = Pick<ToolRunDeps['native'], 'addToolProgressListener' | 'cancelNativeTool'>;

/** How long a cancelled job waits for its native op to stop before it ends anyway. */
export const NATIVE_CANCEL_GRACE_MS = 5000;

const noop = () => {};

/**
 * `nativeOp` for one job: native progress events of this job report `processing`. An abort asks
 * the native job to stop (it rejects with ERR_CANCELLED at its next page) and the op ends as
 * cancelled once the native op has settled, or after `graceMs` at most, so the workspace is not
 * cleaned under a running native op and a hung one cannot block the job forever. An op that
 * settles in any way after an abort still ends as cancelled. The listener is always removed.
 */
export function createNativeOp(
  jobId: string,
  native: NativeOpDeps,
  signal: AbortSignal,
  processing: (f: number) => void,
  graceMs: number = NATIVE_CANCEL_GRACE_MS,
): RunContext['nativeOp'] {
  return async <T>(fn: () => Promise<T>, range: ProgressRange = { from: 0, to: 1 }): Promise<T> => {
    throwIfCancelled(signal);
    const sub = native.addToolProgressListener((e) => {
      if (e.jobId === jobId && Number.isFinite(e.fraction)) {
        const f = Math.min(1, Math.max(0, e.fraction));
        processing(range.from + (range.to - range.from) * f);
      }
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort = noop;
    try {
      const op = fn().catch((e: unknown) => {
        if (isPdfNativeError(e, 'ERR_CANCELLED')) throw new PdfToolError('cancelled');
        throw e;
      });
      const settled = op.then(noop, noop);
      const hung = new Promise<never>((_, reject) => {
        onAbort = () => {
          try {
            native.cancelNativeTool(jobId).catch(noop);
          } catch {
            // Waits for the op or the grace delay all the same.
          }
          const grace = new Promise<void>((res) => {
            timer = setTimeout(res, graceMs);
          });
          void Promise.race([settled, grace]).then(() => reject(new PdfToolError('cancelled')));
        };
      });
      // Settles only after the op lost the race; never an unhandled rejection.
      hung.catch(noop);
      signal.addEventListener('abort', onAbort, { once: true });
      let value: T;
      try {
        value = await Promise.race([op, hung]);
      } catch (e) {
        throwIfCancelled(signal);
        throw e;
      }
      // Finished although the job was cancelled meanwhile: its result is never used.
      throwIfCancelled(signal);
      return value;
    } finally {
      signal.removeEventListener('abort', onAbort);
      if (timer !== undefined) clearTimeout(timer);
      sub.remove();
    }
  };
}

/** Tools whose output's password state is the point of the tool: no "password removed" note. */
const PASSWORD_TOOLS: readonly PdfToolRequest['toolId'][] = ['protect', 'unlock'];

/**
 * Decrypts the locked staged inputs into the workspace, so the runner works on copies without
 * encryption: an input that is not encrypted is kept, any other is replaced by its decrypted copy,
 * opened with `request.passwords[i]` (null: the empty password). A failure belongs to input i
 * (`encrypted` without a password, `wrongPassword`, `restricted`). The note that the output has no
 * password is set unless the tool is Protect or Remove password. Passwords are never logged.
 */
export async function unlockInputs(
  ctx: Omit<RunContext, 'route' | 'locks'>,
): Promise<{ inputs: WorkspaceFile[]; locks: PdfLock[] }> {
  const { native } = ctx.deps;
  const inputs: WorkspaceFile[] = [];
  const locks: PdfLock[] = [];
  for (const [i, staged] of ctx.inputs.entries()) {
    throwIfCancelled(ctx.signal);
    const lock = await as(null, i, () => ctx.time('stage', () => native.inspectPdf(staged.uri)));
    locks.push(lock);
    if (lock === 'none') {
      inputs.push(staged);
      continue;
    }
    const password = ctx.request.passwords?.[i] ?? null;
    const open = await as(null, i, () =>
      ctx.nativeOp(() =>
        ctx.time('stage', () => native.unlockToolInput(staged.uri, ctx.jobId, i, password)),
      ),
    );
    if (!Number.isFinite(open.sizeBytes) || open.sizeBytes < 0) {
      throw new ToolRunFailure('unknown', i);
    }
    inputs.push(open);
    if (!PASSWORD_TOOLS.includes(ctx.request.toolId)) ctx.setExtras({ passwordRemoved: true });
  }
  return { inputs, locks };
}

/** Reads staged input `i` into memory (the JS route only); a failed read is `io` at `i`. */
export function readInput(ctx: RunContext, i: number): Promise<Uint8Array> {
  return as('io', i, () => ctx.time('read', () => ctx.deps.fs.readBytes(ctx.inputs[i]!.uri)));
}

/** One page of a native output: input `i`, 0-based page `p`, extra rotation `r`. */
export type PageRef = { i: number; p: number; r: number };

/**
 * Page counts of the staged inputs `indices` (the native route; a failure belongs to its input).
 * The tool thumbnail lane keeps the last document open, so it is released afterwards: the workspace
 * copy must not stay open (and hold its disk space) after the job.
 */
export async function nativePageCounts(ctx: RunContext, indices: number[]): Promise<number[]> {
  const { native } = ctx.deps;
  try {
    const counts: number[] = [];
    for (const i of indices) {
      const n = await as(null, i, () =>
        ctx.time('embed', () => native.getToolPageCount(ctx.inputs[i]!.uri)),
      );
      if (!Number.isInteger(n) || n < 1) throw new ToolRunFailure('invalid', i);
      counts.push(n);
    }
    return counts;
  } finally {
    try {
      await native.releaseToolDocument();
    } catch {
      // Released again by the next preview or job; the workspace is deleted all the same.
    }
  }
}

/**
 * Assembles `outputs` from every staged input with PdfBox; the files come back in order, named
 * from output number `firstOutput` (1-based) on, with native progress mapped onto `range`.
 */
export async function assembleNative(
  ctx: RunContext,
  outputs: PageRef[][],
  firstOutput = 1,
  range?: ProgressRange,
): Promise<WorkspaceFile[]> {
  const uris = ctx.inputs.map((input) => input.uri);
  const files = await as(null, null, () =>
    ctx.nativeOp(
      () =>
        ctx.time('embed', () =>
          ctx.deps.native.assemblePdf(ctx.jobId, uris, JSON.stringify(outputs), firstOutput),
        ),
      range,
    ),
  );
  if (
    files.length !== outputs.length ||
    files.some((f) => !Number.isFinite(f.sizeBytes) || f.sizeBytes < 0)
  ) {
    throw new ToolRunFailure('unknown', null);
  }
  return files;
}
