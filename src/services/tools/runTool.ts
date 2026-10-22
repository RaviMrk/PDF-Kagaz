import type { FileRow } from '@/db/schema';
import type { PdfFileInfo, PdfNativeApi, StagedInput } from '@/services/native/pdfNative';
import { loadPdf } from '@/services/pdf/loadPdf';
import { mergePdfs } from '@/services/pdf/merge';
import { organizePdf, type PageEdit } from '@/services/pdf/organize';
import { PdfToolError, isPdfToolError, throwIfCancelled } from '@/services/pdf/pdfErrors';
import { splitPdf } from '@/services/pdf/split';
import { everyNGroups, parsePageRanges, uniqueSortedPages } from '@/utils/pageRanges';

import { checkInputSizes, JS_MAX_FILE_BYTES, JS_MAX_TOTAL_BYTES } from './limits';
import { mergedName, organisedName, splitNames, type Translate } from './outputNames';
import { knownSize, toToolFailure } from './toolFailure';
import type { ToolFs } from './toolFs';
import type { ToolFailure } from './toolJobRepo';

export type SplitOptions =
  | { mode: 'ranges'; ranges: string }
  | { mode: 'everyN'; n: number }
  | { mode: 'extract'; ranges: string };

export type ToolRequest =
  | { toolId: 'merge'; inputIds: string[] }
  | { toolId: 'split'; inputIds: [string]; split: SplitOptions }
  | { toolId: 'organize'; inputIds: [string]; pages: PageEdit[] };

export type ToolPhase = 'preparing' | 'processing' | 'saving';

export type ToolOutcome =
  | { ok: true; outputs: FileRow[] }
  | { ok: false; failure: ToolFailure; inputIndex: number | null; outputs: FileRow[] };

export type ToolRunDeps = {
  native: Pick<
    PdfNativeApi,
    'createToolWorkspace' | 'stageToolInput' | 'publishToolOutput' | 'cleanToolWorkspace'
  >;
  fs: ToolFs;
  getRows(ids: string[]): FileRow[];
  registerOutputs(infos: PdfFileInfo[]): Promise<FileRow[]>;
  t: Translate;
  now(): number;
};

export type ToolRunControl = {
  signal: AbortSignal;
  onProgress(phase: ToolPhase, fraction: number): void;
};

/** A failure already mapped to its code and input (thrown inside the runner only). */
class ToolRunFailure extends Error {
  constructor(
    readonly failure: ToolFailure,
    readonly inputIndex: number | null,
  ) {
    super(`tool failed: ${failure}`);
  }
}

/** Runs `fn`; any error but a cancellation becomes `failure` at `inputIndex`. */
async function as<T>(failure: ToolFailure | null, inputIndex: number | null, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ToolRunFailure || isPdfToolError(e, 'cancelled')) throw e;
    throw new ToolRunFailure(failure ?? toToolFailure(e), inputIndex);
  }
}

function failureOf(
  e: unknown,
  singleInput: boolean,
): { failure: ToolFailure; inputIndex: number | null } {
  if (e instanceof ToolRunFailure) return { failure: e.failure, inputIndex: e.inputIndex };
  const failure = toToolFailure(e);
  let inputIndex: number | null = null;
  if (isPdfToolError(e)) {
    // Single-input services load their source without an index: the input is the only one.
    inputIndex =
      e.inputIndex ??
      (singleInput && (failure === 'encrypted' || failure === 'invalid') ? 0 : null);
  }
  return { failure, inputIndex };
}

type Output = { bytes: Uint8Array; name: string };

/**
 * Runs one merge/split/organize job: inputs are staged into the job workspace first (picked
 * documents only carry a transient grant), processed from the staged copies, and every output is
 * published as soon as it is written. Originals are never written. The workspace is always cleaned.
 */
export async function runTool(
  jobId: string,
  request: ToolRequest,
  deps: ToolRunDeps,
  control: ToolRunControl,
): Promise<ToolOutcome> {
  const { native, fs, t } = deps;
  const { signal, onProgress } = control;
  const started = deps.now();
  const published: PdfFileInfo[] = [];
  let workspaceUsed = false;
  let pages = 0;

  let registered: Promise<FileRow[]> | null = null;
  // Once only: outputs already published are registered on failure too.
  const register = (): Promise<FileRow[]> =>
    (registered ??= published.length === 0 ? Promise.resolve([]) : deps.registerOutputs(published));

  try {
    const ids = request.inputIds;
    const found = new Map(deps.getRows(ids).map((r) => [r.id, r]));
    const missing = ids.findIndex((id) => !found.has(id));
    if (missing >= 0) throw new ToolRunFailure('notFound', missing);
    const rows = ids.map((id) => found.get(id) as FileRow);

    // Unknown sizes (NaN, negative) count as 0 here; the native stage cap refuses them if large.
    const sizes = checkInputSizes(rows.map((r) => knownSize(r.sizeBytes)));
    if (!sizes.ok) {
      throw new ToolRunFailure(sizes.reason, sizes.reason === 'tooLarge' ? sizes.index : null);
    }

    throwIfCancelled(signal);
    workspaceUsed = true;
    const workspace = await as(null, null, () => native.createToolWorkspace(jobId));

    onProgress('preparing', 0);
    const staged: StagedInput[] = [];
    let total = 0;
    for (const [i, row] of rows.entries()) {
      throwIfCancelled(signal);
      const input = await as(null, i, () =>
        native.stageToolInput(row.uri, jobId, i, JS_MAX_FILE_BYTES),
      );
      if (!Number.isFinite(input.sizeBytes) || input.sizeBytes < 0) {
        throw new ToolRunFailure('unknown', i);
      }
      if (input.sizeBytes > JS_MAX_FILE_BYTES) throw new ToolRunFailure('tooLarge', i);
      total += input.sizeBytes;
      if (total > JS_MAX_TOTAL_BYTES) throw new ToolRunFailure('totalTooLarge', null);
      staged.push(input);
      onProgress('preparing', (i + 1) / rows.length);
    }

    const read = (i: number) => as('io', i, () => fs.readBytes(staged[i]!.uri));
    const processing = (f: number) => onProgress('processing', f);
    let k = 0;
    const save = async (out: Output, fraction: number) => {
      k += 1;
      const uri = `${workspace}/out-${k}.pdf`;
      await as('io', null, () => fs.writeBytes(uri, out.bytes));
      // Checked before each publish; a publish once started is never interrupted.
      throwIfCancelled(signal);
      onProgress('saving', fraction);
      published.push(await as(null, null, () => native.publishToolOutput(uri, out.name)));
    };

    throwIfCancelled(signal);
    onProgress('processing', 0);
    const first = rows[0]!;
    if (request.toolId === 'merge') {
      const sources = staged.map((_, i) => () => read(i));
      const bytes = await mergePdfs(sources, { signal, onProgress: processing });
      if (__DEV__) pages = (await loadPdf(bytes)).getPageCount();
      await save({ bytes, name: mergedName(first.name, t) }, 1);
    } else if (request.toolId === 'organize') {
      const bytes = await organizePdf(await read(0), request.pages, {
        signal,
        onProgress: processing,
      });
      pages = request.pages.length;
      await save({ bytes, name: organisedName(first.name, t) }, 1);
    } else {
      const bytes = await read(0);
      const pageCount = (await loadPdf(bytes, 0)).getPageCount();
      const groups = splitGroups(request.split, pageCount);
      const names = splitNames(first.name, request.split.mode, groups, t);
      pages = groups.reduce((n, g) => n + g.length, 0);
      await splitPdf(bytes, groups, {
        signal,
        onProgress: processing,
        onPart: (i, part) => save({ bytes: part, name: names[i]! }, (i + 1) / groups.length),
      });
    }

    const outputs = await register();
    if (__DEV__) {
      const ms = deps.now() - started;
      console.log(`[tool] ${request.toolId} ${ms}ms ${pages} pages ${published.length} files`);
    }
    return { ok: true, outputs };
  } catch (e) {
    const { failure, inputIndex } = failureOf(e, request.inputIds.length === 1);
    const outputs = await register().catch((): FileRow[] => []);
    return { ok: false, failure, inputIndex, outputs };
  } finally {
    if (workspaceUsed) {
      try {
        await native.cleanToolWorkspace(jobId);
      } catch {
        // Left for cleanupToolLeftovers at the next start.
      }
    }
  }
}

function splitGroups(split: SplitOptions, pageCount: number): number[][] {
  if (split.mode === 'everyN') {
    const groups = everyNGroups(pageCount, split.n);
    if (groups.length === 0) throw new PdfToolError('badPages');
    return groups;
  }
  const parsed = parsePageRanges(split.ranges, pageCount);
  if (!parsed.ok) throw new PdfToolError('badPages');
  return split.mode === 'extract' ? [uniqueSortedPages(parsed.groups)] : parsed.groups;
}
