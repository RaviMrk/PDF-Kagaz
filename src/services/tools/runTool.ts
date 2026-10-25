import type { FileRow } from '@/db/schema';
import {
  isPdfNativeError,
  type CompressLevel,
  type ImageFilter,
  type ImageFormat,
  type PdfFileInfo,
  type PdfNativeApi,
  type PreparedPage,
  type WorkspaceFile,
} from '@/services/native/pdfNative';
import type { ImageLayoutOptions } from '@/services/pdf/imageLayout';
import { imagesToPdf } from '@/services/pdf/imagesToPdf';
import type { PageEdit } from '@/services/pdf/organize';
import { isPdfToolError, throwIfCancelled } from '@/services/pdf/pdfErrors';
import { fileIdForUri } from '@/utils/fileId';

import {
  capsFor,
  checkInputSizes,
  IMAGE_QUALITY_PRESETS,
  type Caps,
  type ImageQuality,
  IMAGE_TOTAL_BUDGET,
  IMAGES_MAX,
  JS_MAX_TOTAL_BYTES,
  routeFor,
} from './limits';
import { customOutputName, imagesName, scanName, type Translate } from './outputNames';
import { createPhaseTimer, formatPhases } from './phaseTimer';
import {
  as,
  createNativeOp,
  ToolRunFailure,
  unlockInputs,
  type RunContext,
  type ToolRunner,
} from './runners/context';
import { runCompress } from './runners/compress';
import { runProtect } from './runners/protect';
import { runUnlock } from './runners/unlock';
import { runMerge } from './runners/merge';
import { runOrganize } from './runners/organize';
import { runPageNumbers } from './runners/pageNumbers';
import { runPdfToImages } from './runners/pdfToImages';
import { runSign } from './runners/sign';
import { runSplit } from './runners/split';
import { runWatermark } from './runners/watermark';
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

/**
 * Input index → password. Lives only in component state and this in-memory request: never stored
 * with the job, logged or sent anywhere.
 */
export type Passwords = Partial<Record<number, string>>;
export type { CompressLevel, ImageFormat };
export type ExportDpi = 72 | 150 | 300;
export type StampPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';
export type WatermarkOptions = {
  source:
    | { kind: 'text'; text: string; color: 'grey' | 'red' | 'blue' }
    | { kind: 'image'; sessionId: string; index: number };
  opacity: number;
  angle: 0 | 45 | 90 | -45;
  size: 'small' | 'medium' | 'large';
  position: StampPosition;
  pages: number[] | null;
};
export type PageNumberOptions = {
  position: Exclude<StampPosition, 'middle-left' | 'center' | 'middle-right'>;
  format: 'n' | 'pageOfTotal';
  start: number;
  fontSize: 10 | 12 | 14 | 18;
  pages: number[] | null;
};
/** `cx`, `cy` (centre) and `width` are fractions of the visual page; `page` is 1-based. */
export type SignaturePlacement = {
  signatureId: number;
  page: number;
  cx: number;
  cy: number;
  width: number;
};

export type MergeRequest = { toolId: 'merge'; inputIds: string[]; passwords?: Passwords };
export type SplitRequest = {
  toolId: 'split';
  inputIds: [string];
  split: SplitOptions;
  passwords?: Passwords;
};
export type OrganizeRequest = {
  toolId: 'organize';
  inputIds: [string];
  pages: PageEdit[];
  passwords?: Passwords;
};

/** Every request that works on picked PDFs (staged into the job workspace first). */
export type PdfToolRequest =
  | MergeRequest
  | SplitRequest
  | OrganizeRequest
  | { toolId: 'compress'; inputIds: [string]; level: CompressLevel; passwords?: Passwords }
  | { toolId: 'protect'; inputIds: [string]; newPassword: string; passwords?: Passwords }
  | { toolId: 'unlock'; inputIds: [string]; passwords?: Passwords }
  | {
      toolId: 'pdf-to-images';
      inputIds: [string];
      format: ImageFormat;
      dpi: ExportDpi;
      pages: number[] | null;
      passwords?: Passwords;
    }
  | { toolId: 'watermark'; inputIds: [string]; watermark: WatermarkOptions; passwords?: Passwords }
  | {
      toolId: 'page-numbers';
      inputIds: [string];
      numbers: PageNumberOptions;
      passwords?: Passwords;
    }
  | {
      toolId: 'sign';
      inputIds: [string];
      placements: SignaturePlacement[];
      passwords?: Passwords;
    };

export type ToolRequest = PdfToolRequest | ImagesRequest;

export function isImagesRequest(request: ToolRequest): request is ImagesRequest {
  return request.toolId === 'images-to-pdf' || request.toolId === 'scan';
}

/** The image session a request reads from: an images request's, or a watermark image's. */
export function sessionIdOf(request: ToolRequest): string | null {
  if (isImagesRequest(request)) return request.sessionId;
  if (request.toolId === 'watermark' && request.watermark.source.kind === 'image') {
    return request.watermark.source.sessionId;
  }
  return null;
}

export type ToolPhase = 'preparing' | 'processing' | 'saving';

/** Pages saved as images (PDF to images); `reducedPages` were rendered below the asked DPI. */
export type SavedImages = { count: number; folder: string; uris: string[]; reducedPages: number };
export type ToolExtras = {
  sizes?: { before: number; after: number };
  images?: SavedImages;
  passwordRemoved?: true;
};

export type ToolOutcome =
  | { ok: true; outputs: FileRow[]; extras?: ToolExtras }
  | {
      ok: false;
      failure: ToolFailure;
      inputIndex: number | null;
      outputs: FileRow[];
      extras?: ToolExtras;
    };

export type ToolRunDeps = {
  native: Pick<
    PdfNativeApi,
    | 'createToolWorkspace'
    | 'stageToolInput'
    | 'prepareImagePage'
    | 'publishToolOutput'
    | 'cleanToolWorkspace'
    | 'cancelNativeTool'
    | 'addToolProgressListener'
    | 'inspectPdf'
    | 'unlockToolInput'
    | 'getToolPageCount'
    | 'releaseToolDocument'
    | 'assemblePdf'
    | 'compressPdf'
    | 'protectPdf'
    | 'renderPdfPage'
    | 'releasePageExport'
    | 'publishImageOutput'
    | 'stampPdf'
    | 'renderTextStamp'
    | 'prepareStampImage'
  >;
  fs: ToolFs;
  getRows(ids: string[]): FileRow[];
  registerOutputs(infos: PdfFileInfo[]): Promise<FileRow[]>;
  /** Records a published output on the job row as soon as it exists (errors are ignored). */
  recordOutput(jobId: string, info: PdfFileInfo): void;
  /** The PNG (file:// URI) of saved signature `id`; null when it was deleted. */
  getSignaturePng(id: number): string | null;
  /** file:// URI of the saved signatures folder (filesDir/signatures); only PNGs in it are used. */
  signaturesDir: string;
  t: Translate;
  now(): number;
  /** Route caps (tests force the native route with tiny JS caps); default JS_CAPS / NATIVE_CAPS. */
  caps?: { js: Caps; native: Caps };
  /** How long a cancel waits for a native op to stop; default NATIVE_CANCEL_GRACE_MS. */
  nativeCancelGraceMs?: number;
};

export type ToolRunControl = {
  signal: AbortSignal;
  onProgress(phase: ToolPhase, fraction: number): void;
};

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

/** Per-tool runners for PDF tools; a runnable tool without one fails as `unknown`. */
export const RUNNERS: { [K in PdfToolRequest['toolId']]?: ToolRunner<PdfRequestOf<K>> } = {
  merge: runMerge,
  split: runSplit,
  organize: runOrganize,
  compress: runCompress,
  protect: runProtect,
  unlock: runUnlock,
  'pdf-to-images': runPdfToImages,
  watermark: runWatermark,
  'page-numbers': runPageNumbers,
  sign: runSign,
};

type PdfRequestOf<K extends PdfToolRequest['toolId']> = Extract<PdfToolRequest, { toolId: K }>;

/**
 * Runs one job. PDF tools: inputs are staged into the job workspace first (picked documents only
 * carry a transient grant) under the tool's caps, the route is chosen from the staged sizes and the
 * tool's runner processes the staged copies. Images and scans:
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
  let extras: ToolExtras | undefined;

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

  const publishFile = async (file: WorkspaceFile, name: string, from: number, to: number) => {
    // Checked before each publish; a publish once started is never interrupted.
    throwIfCancelled(signal);
    onProgress('saving', from);
    const info = await as(null, null, () =>
      time('publish', () => native.publishToolOutput(file.uri, name)),
    );
    published.push(info);
    try {
      deps.recordOutput(jobId, info);
    } catch {
      // finishJob records the outputs again; only a process death loses this one.
    }
    onProgress('saving', to);
  };

  let k = 0;
  const save = async (out: Output, from: number, to: number) => {
    k += 1;
    const uri = `${workspace}/out-${k}.pdf`;
    await as('io', null, () => time('save', () => fs.writeBytes(uri, out.bytes)));
    await publishFile({ uri, sizeBytes: out.bytes.length }, out.name, from, to);
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

  const runPdfs = async (request: PdfToolRequest) => {
    const ids = request.inputIds;
    const found = new Map(deps.getRows(ids).map((r) => [r.id, r]));
    const missing = ids.findIndex((id) => !found.has(id));
    if (missing >= 0) throw new ToolRunFailure('notFound', missing);
    const rows = ids.map((id) => found.get(id) as FileRow);
    const caps = capsFor(request.toolId);

    // Unknown sizes (NaN, negative) count as 0 here; the native stage cap refuses them if large.
    const sizes = checkInputSizes(
      rows.map((r) => knownSize(r.sizeBytes)),
      caps,
    );
    if (!sizes.ok) {
      throw new ToolRunFailure(sizes.reason, sizes.reason === 'tooLarge' ? sizes.index : null);
    }

    await openWorkspace();

    onProgress('preparing', 0);
    const staged: WorkspaceFile[] = [];
    let total = 0;
    for (const [i, row] of rows.entries()) {
      throwIfCancelled(signal);
      const input = await as(null, i, () =>
        time('stage', () => native.stageToolInput(row.uri, jobId, i, caps.file)),
      );
      if (!Number.isFinite(input.sizeBytes) || input.sizeBytes < 0) {
        throw new ToolRunFailure('unknown', i);
      }
      if (input.sizeBytes > caps.file) throw new ToolRunFailure('tooLarge', i);
      total += input.sizeBytes;
      if (total > caps.total) throw new ToolRunFailure('totalTooLarge', null);
      staged.push(input);
      onProgress('preparing', (i + 1) / rows.length);
    }

    const base: Omit<RunContext, 'route' | 'locks'> = {
      jobId,
      workspace,
      request,
      rows,
      inputs: staged,
      deps,
      signal,
      t,
      time,
      processing,
      save,
      publishFile,
      nativeOp: createNativeOp(jobId, native, signal, processing, deps.nativeCancelGraceMs),
      setPages: (n) => {
        pages = n;
      },
      setExtras: (e) => {
        extras = { ...extras, ...e };
      },
    };
    const { inputs, locks } = await unlockInputs(base);
    const route = routeFor(
      request.toolId,
      inputs.map((input) => input.sizeBytes),
      deps.caps,
    );

    const runner = RUNNERS[request.toolId] as ToolRunner | undefined;
    if (!runner) throw new ToolRunFailure('unknown', null);
    throwIfCancelled(signal);
    onProgress('processing', 0);
    await runner({ ...base, inputs, locks, route });
  };

  try {
    if (isImagesRequest(request)) await runImages(request);
    else await runPdfs(request);

    const outputs = await register();
    // Release builds too (counts and timing only, never names).
    const ms = deps.now() - started;
    console.log(`[tool] ${request.toolId} ${ms}ms ${pages} pages ${published.length} files`);
    console.log(formatPhases(request.toolId, timer.totals()));
    return extras ? { ok: true, outputs, extras } : { ok: true, outputs };
  } catch (e) {
    if (e instanceof RegistrationFailure) {
      return { ok: false, failure: 'io', inputIndex: null, outputs: e.outputs };
    }
    const { failure, inputIndex } = failureOf(e, request.inputIds.length === 1);
    const outputs = await register().catch((r: unknown) =>
      r instanceof RegistrationFailure ? r.outputs : [],
    );
    // Extras of what was already saved (images of PDF to images) stay with a failure or cancel.
    return extras
      ? { ok: false, failure, inputIndex, outputs, extras }
      : { ok: false, failure, inputIndex, outputs };
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
