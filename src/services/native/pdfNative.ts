import PdfNative from '../../../modules/pdf-native';
import type {
  CompressLevel,
  CompressResult,
  FolderChange,
  FolderStamp,
  ImageFilter,
  ImportedImage,
  IncomingPdfEvent,
  PasswordCheck,
  PdfFileInfo,
  PdfLock,
  PickedFolder,
  PickedImageUris,
  PreparedPage,
  ReaderFile,
  ScanProgressEvent,
  ScanResult,
  StagedInput,
  ToolProgressEvent,
  WorkspaceFile,
} from '../../../modules/pdf-native';

export type {
  CompressLevel,
  CompressResult,
  FolderChange,
  FolderStamp,
  ImageFilter,
  ImportedImage,
  IncomingPdfEvent,
  PasswordCheck,
  PdfFileInfo,
  PdfLock,
  PickedFolder,
  PickedImageUris,
  PreparedPage,
  ReaderFile,
  ScanProgressEvent,
  ScanResult,
  StagedInput,
  ToolProgressEvent,
  WorkspaceFile,
} from '../../../modules/pdf-native';

export interface PdfNativeApi {
  scanPdfs(roots?: string[] | null): Promise<ScanResult>;
  scanChangedFolders(known: FolderStamp[]): Promise<FolderChange[]>;
  /**
   * Turns Crashlytics collection off in the running process at once (the Firebase JS API only
   * stores the opt-out for the next start). False when Firebase is not linked.
   */
  disableCrashlyticsNow(): boolean;
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
  /** Clears thumbnails, reader copies and share copies (the latter only when older than 10 minutes); returns bytes freed. */
  clearCaches(): Promise<number>;
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
  /**
   * Cancels the native job `jobId`: it stops at its next page and rejects with ERR_CANCELLED. A
   * cancel that arrives before the job begins is remembered for 60 s.
   */
  cancelNativeTool(jobId: string): Promise<void>;
  /** Deletes a job workspace; idempotent. */
  cleanToolWorkspace(jobId: string): Promise<void>;
  /** Deletes tool leftovers older than `olderThanMs` (epoch ms); returns how many. */
  cleanupToolLeftovers(olderThanMs: number): Promise<number>;
  /**
   * How a PDF (a source this app may read, or a tool workspace file) is locked; read in place
   * through a descriptor. Damaged → ERR_PDF_INVALID.
   */
  inspectPdf(uri: string): Promise<PdfLock>;
  /** Whether `password` opens the PDF with permission to change it. Never logged or stored. */
  checkPdfPassword(uri: string, password: string): Promise<PasswordCheck>;
  /**
   * Writes a decrypted copy of workspace file `fileUri` of job `jobId` as `in-<index>.open.pdf`
   * (a native job: cancelNativeTool stops it). Null `password` tries the empty one. Rejects with
   * ERR_PDF_ENCRYPTED (a password is needed), ERR_PASSWORD_WRONG, or ERR_PASSWORD_RESTRICTED (it
   * opens, but without permission to change it). Other files: ERR_PERMISSION_DENIED.
   */
  unlockToolInput(
    fileUri: string,
    jobId: string,
    index: number,
    password: string | null,
  ): Promise<WorkspaceFile>;
  /**
   * Merge / split / organise with PdfBox (a native job: cancelNativeTool stops it). `inputUris` are
   * files of job `jobId`'s workspace (anything else: ERR_PERMISSION_DENIED); `outputsJson` is one
   * array per output of `{ i: input, p: 0-based page, r: extra rotation 0/90/180/270 }` (a JSON
   * string, so expo needs no reflection on records). Output k (0-based) is written as
   * `out-native-<firstOutput + k>.pdf` in the workspace (batches of one job pass their own
   * `firstOutput`, from 1). Bad refs: ERR_INVALID_NAME; a damaged page: ERR_PDF_INVALID.
   */
  assemblePdf(
    jobId: string,
    inputUris: string[],
    outputsJson: string,
    firstOutput: number,
  ): Promise<WorkspaceFile[]>;
  /**
   * Compress with PdfBox (a native job: cancelNativeTool stops it): the eligible images of
   * workspace file `fileUri` of job `jobId` are re-encoded at `level` into `out-compressed.pdf`
   * (other files: ERR_PERMISSION_DENIED). The output may be no smaller than the input. Unknown
   * level: ERR_INVALID_NAME; damaged: ERR_PDF_INVALID.
   */
  compressPdf(fileUri: string, jobId: string, level: CompressLevel): Promise<CompressResult>;
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
  /**
   * System photo picker, images only (`max` clamped to 1..IMAGES_MAX); `uris` is empty when
   * cancelled. At most `max` picks are kept, in order; `dropped` counts the picks over `max` (the
   * ACTION_OPEN_DOCUMENT fallback has no item limit). No media permission is used and no
   * persistable grant is taken. Picks this app may not read are dropped silently; rejects with
   * ERR_PERMISSION_DENIED when every kept image was refused.
   */
  pickImages(max: number): Promise<PickedImageUris>;
  /**
   * Google Play services document scanner (`pageLimit` clamped to 1..IMAGES_MAX). The scanned pages
   * are imported into the image session as sources `firstIndex`, `firstIndex + 1`… and returned in
   * scanner order; a page that fails to import is skipped. Resolves [] when cancelled. Rejects with
   * ERR_SCANNER_UNAVAILABLE (Play services or the scanner module missing), ERR_IMAGE_INVALID (no
   * page could be imported) or ERR_INVALID_NAME (not an image session).
   */
  scanDocument(sessionId: string, firstIndex: number, pageLimit: number): Promise<ImportedImage[]>;
  addScanProgressListener(cb: (e: ScanProgressEvent) => void): { remove(): void };
  /** PDFs shared to the app while it is running (ACTION_VIEW is left to Linking). */
  addIncomingPdfListener(cb: (e: IncomingPdfEvent) => void): { remove(): void };
  /** Progress (0..1) of running native tool jobs, at most every 100 ms plus once at 1. */
  addToolProgressListener(cb: (e: ToolProgressEvent) => void): { remove(): void };
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
  'ERR_SCANNER_UNAVAILABLE',
  'ERR_PASSWORD_WRONG',
  'ERR_PASSWORD_RESTRICTED',
  'ERR_CANCELLED',
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
  disableCrashlyticsNow: () => PdfNative.disableCrashlyticsNow(),
  hasAllFilesAccess: () => PdfNative.hasAllFilesAccess(),
  openAllFilesAccessSettings: () => PdfNative.openAllFilesAccessSettings(),
  generateThumbnail: (uri, page, width) => PdfNative.generateThumbnail(uri, page, width),
  getPageCount: (uri, password) => PdfNative.getPageCount(uri, password),
  prepareReaderFile: (uri) => PdfNative.prepareReaderFile(uri),
  renderReaderThumbnail: (fileUri, page, width) =>
    PdfNative.renderReaderThumbnail(fileUri, page, width),
  releaseReaderDocument: () => PdfNative.releaseReaderDocument(),
  clearCaches: () => PdfNative.clearCaches(),
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
  cancelNativeTool: (jobId) => PdfNative.cancelNativeTool(jobId),
  cleanToolWorkspace: (jobId) => PdfNative.cleanToolWorkspace(jobId),
  cleanupToolLeftovers: (olderThanMs) => PdfNative.cleanupToolLeftovers(olderThanMs),
  inspectPdf: (uri) => PdfNative.inspectPdf(uri),
  checkPdfPassword: (uri, password) => PdfNative.checkPdfPassword(uri, password),
  unlockToolInput: (fileUri, jobId, index, password) =>
    PdfNative.unlockToolInput(fileUri, jobId, index, password),
  assemblePdf: (jobId, inputUris, outputsJson, firstOutput) =>
    PdfNative.assemblePdf(jobId, inputUris, outputsJson, firstOutput),
  compressPdf: (fileUri, jobId, level) => PdfNative.compressPdf(fileUri, jobId, level),
  renderToolThumbnail: (fileUri, page, width) =>
    PdfNative.renderToolThumbnail(fileUri, page, width),
  getToolPageCount: (fileUri) => PdfNative.getToolPageCount(fileUri),
  releaseToolDocument: () => PdfNative.releaseToolDocument(),
  saveCopyAs: (uri, suggestedName) => PdfNative.saveCopyAs(uri, suggestedName),
  pickPdfDocuments: (multiple) => PdfNative.pickPdfDocuments(multiple),
  pickImages: (max) => PdfNative.pickImages(max),
  scanDocument: (sessionId, firstIndex, pageLimit) =>
    PdfNative.scanDocument(sessionId, firstIndex, pageLimit),
  addScanProgressListener: (cb) => PdfNative.addListener('onScanProgress', cb),
  addIncomingPdfListener: (cb) => PdfNative.addListener('onIncomingPdf', cb),
  addToolProgressListener: (cb) => PdfNative.addListener('onToolProgress', cb),
};
