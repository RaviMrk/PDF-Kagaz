import type { FileRow } from '@/db/schema';
import {
  isPdfNativeError,
  type ImageFilter,
  type PdfFileInfo,
  type PdfNativeApi,
  type PreparedPage,
  type StagedInput,
} from '@/services/native/pdfNative';
import type { ImageLayoutOptions } from '@/services/pdf/imageLayout';
import { imagesToPdf } from '@/services/pdf/imagesToPdf';
import { loadPdf } from '@/services/pdf/loadPdf';
import { mergePdfs } from '@/services/pdf/merge';
import { organizePdf, type PageEdit } from '@/services/pdf/organize';
import { PdfToolError, isPdfToolError, throwIfCancelled } from '@/services/pdf/pdfErrors';
import { splitPdf } from '@/services/pdf/split';
import { fileIdForUri } from '@/utils/fileId';
import { everyNGroups, parsePageRanges, uniqueSortedPages } from '@/utils/pageRanges';

import {
  checkInputSizes,
  IMAGE_QUALITY_PRESETS,
  type ImageQuality,
  IMAGE_TOTAL_BUDGET,
  IMAGES_MAX,
  JS_MAX_FILE_BYTES,
  JS_MAX_TOTAL_BYTES,
} from './limits';
import {
  customOutputName,
  imagesName,
  mergedName,
  organisedName,
  scanName,
  splitNames,
  type Translate,
} from './outputNames';
import { createPhaseTimer, formatPhases } from './phaseTimer';
import { knownSize, toToolFailure } from './toolFailure';
import type { ToolFs } from './toolFs';
import type { ToolFailure } from './toolJobRepo';

export type SplitOptions =
  | { mode: 'ranges'; ranges: string }
  | { mode: 'everyN'; n: number }
  | { mode: 'extract'; ranges: string };

/**
 * Images to PDF or a scan: session sources `images` (in page order) become one PDF. `name` is the
 * user's typed output name (null or blank: the default name); it is never stored with the job.
 */
export type ImagesRequest = {
  toolId: 'images-to-pdf' | 'scan';
  inputIds: [];
  sessionId: string;
  images: number[];
  filter: ImageFilter;
  layout: ImageLayoutOptions;
  name: string | null;
  quality: ImageQuality;
};

export type ToolRequest =
  | { toolId: 'merge'; inputIds: string[] }
  | { toolId: 'split'; inputIds: [string]; split: SplitOptions }
  | { toolId: 'organize'; inputIds: [string]; pages: PageEdit[] }
  | ImagesRequest;

export function isImagesRequest(request: ToolRequest): request is ImagesRequest {
  return request.toolId === 'images-to-pdf' || request.toolId === 'scan';
}

export type ToolPhase = 'preparing' | 'processing' | 'saving';

export type ToolOutcome =
  | { ok: true; outputs: FileRow[] }
  | { ok: false; failure: ToolFailure; inputIndex: number | null; outputs: FileRow[] };

export type ToolRunDeps = {
  native: Pick<
    PdfNativeApi,
    | 'createToolWorkspace'
    | 'stageToolInput'
    | 'prepareImagePage'
    | 'publishToolOutput'
    | 'cleanToolWorkspace'
  >;
  fs: ToolFs;
  getRows(ids: string[]): FileRow[];
  registerOutputs(infos: PdfFileInfo[]): Promise<FileRow[]>;
  /** Records a published output on the job row as soon as it exists (errors are ignored). */
  recordOutput(jobId: string, info: PdfFileInfo): void;
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

/** Published outputs the index could not register (they exist on disk). */
class RegistrationFailure extends Error {
  constructor(readonly outputs: FileRow[]) {
    super('tool outputs not registered');
  }
}

/** A row for a published output that is not indexed yet (same id the next scan gives it). */
function unindexedRow(info: PdfFileInfo): FileRow {
  return {
    id: fileIdForUri(info.uri),
    uri: info.uri,
    name: info.name,
    folder: info.folder,
    parentUri: info.parentUri === '' ? null : info.parentUri,
    sizeBytes: info.sizeBytes,
    modifiedAt: info.modifiedAt,
    pageCount: null,
    thumbPath: null,
    isEncrypted: false,
    isCorrupt: false,
    isFavorite: false,
    lastPage: null,
    lastOpenedAt: null,
    source: 'output',
  };
}

const PHASE_ORDER: readonly ToolPhase[] = ['preparing', 'processing', 'saving'];

/**
 * One phase sequence: an earlier phase is never reported after a later one (split publishes parts
 * while still processing) and a fraction never goes back within a phase.
 */
function monotonicProgress(report: ToolRunControl['onProgress']): ToolRunControl['onProgress'] {
  let phase = -1;
  let fraction = 0;
  return (next, f) => {
    const at = PHASE_ORDER.indexOf(next);
    if (at < phase || (at === phase && f < fraction)) return;
    phase = at;
    fraction = f;
    report(next, f);
  };
}

/**
 * Runs one job. Merge/split/organize: inputs are staged into the job workspace first (picked
 * documents only carry a transient grant) and processed from the staged copies. Images and scans:
 * each session source is prepared natively as a bounded JPEG page in the job workspace, then the
 * pages become one PDF; the image session itself is never deleted here. Every output is published
 * as soon as it is written. Originals are never written. The job workspace is always cleaned.
 */
export async function runTool(
  jobId: string,
  request: ToolRequest,
  deps: ToolRunDeps,
  control: ToolRunControl,
): Promise<ToolOutcome> {
  const { native, fs, t } = deps;
  const { signal } = control;
  const onProgress = monotonicProgress(control.onProgress);
  const started = deps.now();
  const timer = createPhaseTimer(() => deps.now());
  const { time } = timer;
  const published: PdfFileInfo[] = [];
  let workspaceUsed = false;
  let pages = 0;

  let registered: Promise<FileRow[]> | null = null;
  // Once only: outputs already published are registered on failure too. Outputs the index could
  // not take (DB error) are still returned, so files that exist are never reported as missing.
  const register = (): Promise<FileRow[]> =>
    (registered ??= (async () => {
      if (published.length === 0) return [];
      let rows: FileRow[] = [];
      let failed = false;
      try {
        rows = await deps.registerOutputs(published);
      } catch {
        failed = true;
      }
      const byId = new Map(rows.map((r) => [r.id, r]));
      const outputs = published.map(
        (info) => byId.get(fileIdForUri(info.uri)) ?? unindexedRow(info),
      );
      if (failed) throw new RegistrationFailure(outputs);
      return outputs;
    })());

  let workspace = '';
  const openWorkspace = async () => {
    throwIfCancelled(signal);
    workspaceUsed = true;
    workspace = await as(null, null, () => native.createToolWorkspace(jobId));
  };

  const processing = (f: number) => onProgress('processing', f);
  let k = 0;
  const save = async (out: Output, from: number, to: number) => {
    k += 1;
    const uri = `${workspace}/out-${k}.pdf`;
    await as('io', null, () => time('save', () => fs.writeBytes(uri, out.bytes)));
    // Checked before each publish; a publish once started is never interrupted.
    throwIfCancelled(signal);
    onProgress('saving', from);
    const info = await as(null, null, () =>
      time('publish', () => native.publishToolOutput(uri, out.name)),
    );
    published.push(info);
    try {
      deps.recordOutput(jobId, info);
    } catch {
      // finishJob records the outputs again; only a process death loses this one.
    }
    onProgress('saving', to);
  };

  /** Prepares session source `source` as page `index`, mapping its failure for this job. */
  const prepare = async (
    request: ImagesRequest,
    source: number,
    index: number,
    longSidePx: number,
    quality: number,
  ) => {
    let page: PreparedPage;
    try {
      page = await time('prepare', () =>
        native.prepareImagePage(
          request.sessionId,
          source,
          jobId,
          index,
          longSidePx,
          quality,
          request.filter,
        ),
      );
    } catch (e) {
      throwIfCancelled(signal);
      // The session was deleted (another process cleaned it up at its start): add them again.
      if (isPdfNativeError(e, 'ERR_FILE_NOT_FOUND')) throw new ToolRunFailure('imagesGone', null);
      throw new ToolRunFailure(toToolFailure(e), index);
    }
    if (!Number.isFinite(page.sizeBytes) || page.sizeBytes < 0) {
      throw new ToolRunFailure('unknown', index);
    }
    return page;
  };

  const runImages = async (request: ImagesRequest) => {
    const n = request.images.length;
    if (n < 1 || n > IMAGES_MAX) throw new ToolRunFailure('badPages', null);
    await openWorkspace();

    onProgress('preparing', 0);
    const prepared: PreparedPage[] = [];
    const levels = IMAGE_QUALITY_PRESETS[request.quality];
    const budget = JS_MAX_TOTAL_BYTES * IMAGE_TOTAL_BUDGET;
    let total = 0;
    // Sticky: once a page had to step down a level, the later pages of this job would almost always
    // run over too, so they start at that level and each page is decoded as few times as possible.
    let level = 0;
    const prepareAt = (source: number, index: number) =>
      prepare(request, source, index, levels[level]!.longSidePx, levels[level]!.jpegQuality);
    for (const [index, source] of request.images.entries()) {
      throwIfCancelled(signal);
      let page = await prepareAt(source, index);
      // Over its share of what is left: prepared once more one level lower (overwriting the same
      // page) while a lower level exists. At the last level the total cap below decides.
      while (level < levels.length - 1 && page.sizeBytes > (budget - total) / (n - index)) {
        throwIfCancelled(signal);
        level += 1;
        page = await prepareAt(source, index);
      }
      // Bounded before any byte reaches JS.
      total += page.sizeBytes;
      if (total > JS_MAX_TOTAL_BYTES) throw new ToolRunFailure('totalTooLarge', null);
      prepared.push(page);
      onProgress('preparing', (index + 1) / n);
    }

    throwIfCancelled(signal);
    onProgress('processing', 0);
    let bytes: Uint8Array;
    try {
      bytes = await time('embed', () =>
        imagesToPdf(
          prepared.map((p) => () => time('read', () => fs.readBytes(p.uri))),
          request.layout,
          { signal, onProgress: processing },
        ),
      );
    } catch (e) {
      if (isPdfToolError(e, 'invalid')) throw new ToolRunFailure('imageInvalid', e.inputIndex);
      throw e;
    }
    pages = n;
    const fallback = (request.toolId === 'scan' ? scanName : imagesName)(deps.now(), t);
    await save({ bytes, name: customOutputName(request.name, fallback) }, 0, 1);
  };

  const runPdfs = async (request: Exclude<ToolRequest, ImagesRequest>) => {
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

    await openWorkspace();

    onProgress('preparing', 0);
    const staged: StagedInput[] = [];
    let total = 0;
    for (const [i, row] of rows.entries()) {
      throwIfCancelled(signal);
      const input = await as(null, i, () =>
        time('stage', () => native.stageToolInput(row.uri, jobId, i, JS_MAX_FILE_BYTES)),
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

    const read = (i: number) => as('io', i, () => time('read', () => fs.readBytes(staged[i]!.uri)));

    throwIfCancelled(signal);
    onProgress('processing', 0);
    const first = rows[0]!;
    if (request.toolId === 'merge') {
      const sources = staged.map((_, i) => () => read(i));
      const bytes = await time('embed', () =>
        mergePdfs(sources, {
          signal,
          onProgress: processing,
          onPageCount: (n) => {
            pages = n;
          },
        }),
      );
      await save({ bytes, name: mergedName(first.name, t) }, 0, 1);
    } else if (request.toolId === 'organize') {
      const source = await read(0);
      const bytes = await time('embed', () =>
        organizePdf(source, request.pages, { signal, onProgress: processing }),
      );
      pages = request.pages.length;
      await save({ bytes, name: organisedName(first.name, t) }, 0, 1);
    } else {
      const bytes = await read(0);
      const pageCount = await time('embed', async () => (await loadPdf(bytes, 0)).getPageCount());
      const groups = splitGroups(request.split, pageCount);
      const names = splitNames(first.name, request.split.mode, groups, t);
      pages = groups.reduce((n, g) => n + g.length, 0);
      // Each part's write and publish are timed as save / publish, not as pdf-lib work.
      await time('embed', () =>
        splitPdf(bytes, groups, {
          signal,
          onProgress: processing,
          onPart: (i, part) =>
            save({ bytes: part, name: names[i]! }, i / groups.length, (i + 1) / groups.length),
        }),
      );
    }
  };

  try {
    if (isImagesRequest(request)) await runImages(request);
    else await runPdfs(request);

    const outputs = await register();
    // Release builds too (counts and timing only, never names).
    const ms = deps.now() - started;
    console.log(`[tool] ${request.toolId} ${ms}ms ${pages} pages ${published.length} files`);
    console.log(formatPhases(request.toolId, timer.totals()));
    return { ok: true, outputs };
  } catch (e) {
    if (e instanceof RegistrationFailure) {
      return { ok: false, failure: 'io', inputIndex: null, outputs: e.outputs };
    }
    const { failure, inputIndex } = failureOf(e, request.inputIds.length === 1);
    const outputs = await register().catch((r: unknown) =>
      r instanceof RegistrationFailure ? r.outputs : [],
    );
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
