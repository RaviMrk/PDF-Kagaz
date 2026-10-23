import PdfNative from '../../../modules/pdf-native';
import type {
  FolderChange,
  FolderStamp,
  ImageFilter,
  ImportedImage,
  IncomingPdfEvent,
  PdfFileInfo,
  PickedFolder,
  PreparedPage,
  ReaderFile,
  ScanProgressEvent,
  ScanResult,
  StagedInput,
} from '../../../modules/pdf-native';

export type {
  FolderChange,
  FolderStamp,
  ImageFilter,
  ImportedImage,
  IncomingPdfEvent,
  PdfFileInfo,
  PickedFolder,
  PreparedPage,
  ReaderFile,
  ScanProgressEvent,
  ScanResult,
  StagedInput,
} from '../../../modules/pdf-native';

export interface PdfNativeApi {
  scanPdfs(roots?: string[] | null): Promise<ScanResult>;
  scanChangedFolders(known: FolderStamp[]): Promise<FolderChange[]>;
  hasAllFilesAccess(): Promise<boolean>;
  openAllFilesAccessSettings(): Promise<void>;
  generateThumbnail(uri: string, page: number, width: number): Promise<string>;
  getPageCount(uri: string, password?: string | null): Promise<number>;
  /** A percent-encoded file:// URI the viewer can open: the file itself or a cache copy of a content:// source. */
  prepareReaderFile(uri: string): Promise<ReaderFile>;
  /** Reader page thumbnails, on a lane separate from the Files-list generateThumbnail jobs. */
  renderReaderThumbnail(fileUri: string, page: number, width: number): Promise<string>;
  /** Closes the document kept open for reader thumbnails. */
  releaseReaderDocument(): Promise<void>;
  renameFile(uri: string, newName: string): Promise<PdfFileInfo>;
  deleteFile(uri: string): Promise<void>;
  duplicateFile(uri: string, parentUri: string): Promise<PdfFileInfo>;
  moveToAppFolder(uri: string): Promise<PdfFileInfo>;
  pickFolder(): Promise<PickedFolder | null>;
  releaseFolder(uri: string): Promise<void>;
  getPersistedFolderUris(): Promise<string[]>;
  /** Share sheet for a PDF (file:// through the app's FileProvider, content:// as is); this app is excluded. */
  sharePdf(uri: string, chooserTitle: string): Promise<void>;
  /** "Open with" chooser (ACTION_VIEW) for a PDF; this app is excluded. */
  openPdfWith(uri: string, chooserTitle: string): Promise<void>;
  /** Hands the PDF to the Android print service. */
  printPdf(uri: string, jobName: string): Promise<void>;
  /** The PDF the app was launched with (ACTION_SEND or ACTION_VIEW), consumed so it is returned once; else null. */
  takeIncomingPdf(): Promise<string | null>;
  /** File info for a shared/opened PDF; content:// rows get folder "" and parentUri "". */
  resolveIncomingPdf(uri: string): Promise<PdfFileInfo>;
  /** Releases the persisted read grant taken for an incoming document (call when its row is removed). */
  releaseIncomingGrant(uri: string): Promise<void>;
  /** (Re)creates the private workspace of a tool job, empty; its file:// uri without trailing slash. */
  createToolWorkspace(jobId: string): Promise<string>;
  /**
   * Copies a tool input into the job workspace (guarded read, never written); over `maxBytes`
   * rejects with ERR_TOO_LARGE, whatever size the source reports.
   */
  stageToolInput(uri: string, jobId: string, index: number, maxBytes: number): Promise<StagedInput>;
  /**
   * Copies a picked or scanned image into the image session (`img-…`) as source `index`, under
   * `maxBytes` (ERR_TOO_LARGE); undecodable → ERR_IMAGE_INVALID. Sizes are display-oriented (EXIF).
   */
  importImage(
    uri: string,
    sessionId: string,
    index: number,
    maxBytes: number,
  ): Promise<ImportedImage>;
  /**
   * Writes source `sourceIndex` as an upright, filtered JPEG on white (long side clamped to
   * 256..4096, quality to 50..95) to `page-<pageIndex>.jpg` in the job workspace.
   */
  prepareImagePage(
    sessionId: string,
    sourceIndex: number,
    jobId: string,
    pageIndex: number,
    maxLongSidePx: number,
    jpegQuality: number,
    filter: ImageFilter,
  ): Promise<PreparedPage>;
  /** Cached filtered JPEG thumbnail (long side `width`, clamped to 1..512) of an image source. */
  renderImageThumbnail(
    sessionId: string,
    index: number,
    width: number,
    filter: ImageFilter,
  ): Promise<string>;
  /** Publishes a workspace file to Documents/PDFToolkit under a free name (never overwrites). */
  publishToolOutput(tempUri: string, fileName: string): Promise<PdfFileInfo>;
  /** Deletes a job workspace; idempotent. */
  cleanToolWorkspace(jobId: string): Promise<void>;
  /** Deletes tool leftovers older than `olderThanMs` (epoch ms); returns how many. */
  cleanupToolLeftovers(olderThanMs: number): Promise<number>;
  /**
   * Page thumbnail of a tool workspace file (anything else: ERR_PERMISSION_DENIED), on its own
   * lane apart from the reader and Files list; 1-based page, width clamped to 1..512.
   */
  renderToolThumbnail(fileUri: string, page: number, width: number): Promise<string>;
  /** Page count of a tool workspace file, on the tool thumbnail lane. */
  getToolPageCount(fileUri: string): Promise<number>;
  /** Closes the document kept open for tool thumbnails (call when the organiser closes); idempotent. */
  releaseToolDocument(): Promise<void>;
  /**
   * "Save as": the user picks a new document (system picker, `suggestedName` prefilled) and the
   * PDF is copied into it; the original is untouched. Resolves false when the picker was cancelled.
   * Rejects with ERR_FILE_EXISTS (target left untouched) when the chosen document already has
   * content or is the source itself: an existing document is never overwritten.
   */
  saveCopyAs(uri: string, suggestedName: string): Promise<boolean>;
  /**
   * System PDF picker (content:// URIs, at most 50); resolves [] when cancelled. Picks this app may
   * not read (e.g. its own providers) are dropped; rejects with ERR_PERMISSION_DENIED when every
   * picked document was refused.
   */
  pickPdfDocuments(multiple: boolean): Promise<string[]>;
  addScanProgressListener(cb: (e: ScanProgressEvent) => void): { remove(): void };
  /** PDFs shared to the app while it is running (ACTION_VIEW is left to Linking). */
  addIncomingPdfListener(cb: (e: IncomingPdfEvent) => void): { remove(): void };
}

export const PDF_NATIVE_ERROR_CODES = [
  'ERR_FILE_NOT_FOUND',
  'ERR_PDF_ENCRYPTED',
  'ERR_PDF_INVALID',
  'ERR_PERMISSION_DENIED',
  'ERR_FILE_EXISTS',
  'ERR_INVALID_NAME',
  'ERR_PASSWORD_UNSUPPORTED',
  'ERR_NO_ACTIVITY',
  'ERR_IO',
  'ERR_VOLUME_UNAVAILABLE',
  'ERR_TOO_LARGE',
  'ERR_IMAGE_INVALID',
] as const;

export type PdfNativeErrorCode = (typeof PDF_NATIVE_ERROR_CODES)[number];

export function isPdfNativeError(
  e: unknown,
  code?: PdfNativeErrorCode,
): e is Error & { code: PdfNativeErrorCode } {
  if (!(e instanceof Error) || !('code' in e)) return false;
  const actual = (e as { code: unknown }).code;
  if (!(PDF_NATIVE_ERROR_CODES as readonly unknown[]).includes(actual)) return false;
  return code === undefined || actual === code;
}

/** The only JS entry point to the pdf-native module (screens go through services, never here). */
export const pdfNative: PdfNativeApi = {
  scanPdfs: (roots) => PdfNative.scanPdfs(roots),
  // Two primitive arrays instead of Record objects: expo converts Records with kotlin-reflect,
  // which costs seconds on the first call of a process.
  scanChangedFolders: (known) =>
    PdfNative.scanChangedFolders(
      known.map((k) => k.uri),
      known.map((k) => k.modifiedAt),
    ),
  hasAllFilesAccess: () => PdfNative.hasAllFilesAccess(),
  openAllFilesAccessSettings: () => PdfNative.openAllFilesAccessSettings(),
  generateThumbnail: (uri, page, width) => PdfNative.generateThumbnail(uri, page, width),
  getPageCount: (uri, password) => PdfNative.getPageCount(uri, password),
  prepareReaderFile: (uri) => PdfNative.prepareReaderFile(uri),
  renderReaderThumbnail: (fileUri, page, width) =>
    PdfNative.renderReaderThumbnail(fileUri, page, width),
  releaseReaderDocument: () => PdfNative.releaseReaderDocument(),
  renameFile: (uri, newName) => PdfNative.renameFile(uri, newName),
  deleteFile: (uri) => PdfNative.deleteFile(uri),
  duplicateFile: (uri, parentUri) => PdfNative.duplicateFile(uri, parentUri),
  moveToAppFolder: (uri) => PdfNative.moveToAppFolder(uri),
  pickFolder: () => PdfNative.pickFolder(),
  releaseFolder: (uri) => PdfNative.releaseFolder(uri),
  getPersistedFolderUris: () => PdfNative.getPersistedFolderUris(),
  sharePdf: (uri, chooserTitle) => PdfNative.sharePdf(uri, chooserTitle),
  openPdfWith: (uri, chooserTitle) => PdfNative.openPdfWith(uri, chooserTitle),
  printPdf: (uri, jobName) => PdfNative.printPdf(uri, jobName),
  takeIncomingPdf: () => PdfNative.takeIncomingPdf(),
  resolveIncomingPdf: (uri) => PdfNative.resolveIncomingPdf(uri),
  releaseIncomingGrant: (uri) => PdfNative.releaseIncomingGrant(uri),
  createToolWorkspace: (jobId) => PdfNative.createToolWorkspace(jobId),
  stageToolInput: (uri, jobId, index, maxBytes) =>
    PdfNative.stageToolInput(uri, jobId, index, maxBytes),
  importImage: (uri, sessionId, index, maxBytes) =>
    PdfNative.importImage(uri, sessionId, index, maxBytes),
  prepareImagePage: (
    sessionId,
    sourceIndex,
    jobId,
    pageIndex,
    maxLongSidePx,
    jpegQuality,
    filter,
  ) =>
    PdfNative.prepareImagePage(
      sessionId,
      sourceIndex,
      jobId,
      pageIndex,
      maxLongSidePx,
      jpegQuality,
      filter,
    ),
  renderImageThumbnail: (sessionId, index, width, filter) =>
    PdfNative.renderImageThumbnail(sessionId, index, width, filter),
  publishToolOutput: (tempUri, fileName) => PdfNative.publishToolOutput(tempUri, fileName),
  cleanToolWorkspace: (jobId) => PdfNative.cleanToolWorkspace(jobId),
  cleanupToolLeftovers: (olderThanMs) => PdfNative.cleanupToolLeftovers(olderThanMs),
  renderToolThumbnail: (fileUri, page, width) =>
    PdfNative.renderToolThumbnail(fileUri, page, width),
  getToolPageCount: (fileUri) => PdfNative.getToolPageCount(fileUri),
  releaseToolDocument: () => PdfNative.releaseToolDocument(),
  saveCopyAs: (uri, suggestedName) => PdfNative.saveCopyAs(uri, suggestedName),
  pickPdfDocuments: (multiple) => PdfNative.pickPdfDocuments(multiple),
  addScanProgressListener: (cb) => PdfNative.addListener('onScanProgress', cb),
  addIncomingPdfListener: (cb) => PdfNative.addListener('onIncomingPdf', cb),
};
