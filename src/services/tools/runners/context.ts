import type { FileRow } from '@/db/schema';
import { isPdfNativeError, type WorkspaceFile } from '@/services/native/pdfNative';
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
  request: R;
  rows: FileRow[];
  inputs: WorkspaceFile[];
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
  /** Runs one native job op with progress, cancel and ERR_CANCELLED → cancelled. */
  nativeOp<T>(fn: () => Promise<T>): Promise<T>;
  /** Pages written, for the release log. */
  setPages(n: number): void;
  setExtras(e: ToolExtras): void;
};

export type ToolRunner<R extends PdfToolRequest = PdfToolRequest> = (
  ctx: RunContext<R>,
) => Promise<void>;

type NativeOpDeps = Pick<ToolRunDeps['native'], 'addToolProgressListener' | 'cancelNativeTool'>;

/**
 * `nativeOp` for one job: native progress events of this job report `processing`; an abort asks
 * the native job to stop (it rejects with ERR_CANCELLED at its next page) and the op ends as
 * cancelled at once, without waiting for it. The listener is always removed.
 */
export function createNativeOp(
  jobId: string,
  native: NativeOpDeps,
  signal: AbortSignal,
  processing: (f: number) => void,
): RunContext['nativeOp'] {
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    throwIfCancelled(signal);
    const sub = native.addToolProgressListener((e) => {
      if (e.jobId === jobId && Number.isFinite(e.fraction)) {
        processing(Math.min(1, Math.max(0, e.fraction)));
      }
    });
    let onAbort = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => {
        try {
          native.cancelNativeTool(jobId).catch(() => {});
        } catch {
          // The op still ends as cancelled below.
        }
        reject(new PdfToolError('cancelled'));
      };
    });
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      const op = fn().catch((e: unknown) => {
        if (isPdfNativeError(e, 'ERR_CANCELLED')) throw new PdfToolError('cancelled');
        throw e;
      });
      // An op that settles after the abort won the race must not be an unhandled rejection.
      op.catch(() => {});
      return await Promise.race([op, aborted]);
    } finally {
      signal.removeEventListener('abort', onAbort);
      sub.remove();
    }
  };
}

/** Reads staged input `i` into memory (the JS route only); a failed read is `io` at `i`. */
export function readInput(ctx: RunContext, i: number): Promise<Uint8Array> {
  return as('io', i, () => ctx.time('read', () => ctx.deps.fs.readBytes(ctx.inputs[i]!.uri)));
}

/** A route this runner cannot take yet (the native paths arrive with their own tasks). */
export function requireJsRoute(ctx: RunContext): void {
  if (ctx.route !== 'js') throw new ToolRunFailure('unknown', null);
}
