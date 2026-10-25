import { NativeModule, requireNativeModule } from 'expo';

import type {
  CompressLevel,
  CompressResult,
  FolderChange,
  ImageFormat,
  ImportedImage,
  PasswordCheck,
  PdfLock,
  PdfFileInfo,
  PdfNativeModuleEvents,
  PickedFolder,
  PickedImageUris,
  PreparedPage,
  ReaderFile,
  RenderedPage,
  SavedImage,
  ScanResult,
  StagedInput,
  WorkspaceFile,
} from './PdfNative.types';

declare class PdfNativeModule extends NativeModule<PdfNativeModuleEvents> {
  scanPdfs(roots?: string[] | null): Promise<ScanResult>;
  /** Known folder stamps as parallel arrays (uris[i] was stamped with modifiedAts[i]). */
  scanChangedFolders(uris: string[], modifiedAts: number[]): Promise<FolderChange[]>;
  /** Crashlytics collection off in this process now; false when Firebase is not linked. */
  disableCrashlyticsNow(): boolean;
  hasAllFilesAccess(): Promise<boolean>;
  openAllFilesAccessSettings(): Promise<void>;
  generateThumbnail(uri: string, page: number, width: number): Promise<string>;
  getPageCount(uri: string, password?: string | null): Promise<number>;
  prepareReaderFile(uri: string): Promise<ReaderFile>;
  /** 1-based page, width clamped to 1..512; serialized apart from generateThumbnail. */
  renderReaderThumbnail(fileUri: string, page: number, width: number): Promise<string>;
  releaseReaderDocument(): Promise<void>;
  /** Deletes thumbnails, reader copies and share copies older than 10 minutes; resolves with the bytes freed. */
  clearCaches(): Promise<number>;
  renameFile(uri: string, newName: string): Promise<PdfFileInfo>;
  deleteFile(uri: string): Promise<void>;
  duplicateFile(uri: string, parentUri: string): Promise<PdfFileInfo>;
  moveToAppFolder(uri: string): Promise<PdfFileInfo>;
  pickFolder(): Promise<PickedFolder | null>;
  releaseFolder(uri: string): Promise<void>;
  getPersistedFolderUris(): Promise<string[]>;
  sharePdf(uri: string, chooserTitle: string): Promise<void>;
  openPdfWith(uri: string, chooserTitle: string): Promise<void>;
  printPdf(uri: string, jobName: string): Promise<void>;
  takeIncomingPdf(): Promise<string | null>;
  resolveIncomingPdf(uri: string): Promise<PdfFileInfo>;
  releaseIncomingGrant(uri: string): Promise<void>;
  createToolWorkspace(jobId: string): Promise<string>;
  stageToolInput(uri: string, jobId: string, index: number, maxBytes: number): Promise<StagedInput>;
  importImage(
    uri: string,
    sessionId: string,
    index: number,
    maxBytes: number,
  ): Promise<ImportedImage>;
  prepareImagePage(
    sessionId: string,
    sourceIndex: number,
    jobId: string,
    pageIndex: number,
    maxLongSidePx: number,
    jpegQuality: number,
    filter: string,
  ): Promise<PreparedPage>;
  renderImageThumbnail(
    sessionId: string,
    index: number,
    width: number,
    filter: string,
  ): Promise<string>;
  publishToolOutput(tempUri: string, fileName: string): Promise<PdfFileInfo>;
  /** Cancels a running native job (its next check throws ERR_CANCELLED); remembered for 60 s if it has not begun. */
  cancelNativeTool(jobId: string): Promise<void>;
  /** Starts the job's foreground service and progress notification; false when refused (never rejects). */
  startJobNotice(
    jobId: string,
    title: string,
    cancelLabel: string,
    channelName: string,
  ): Promise<boolean>;
  updateJobNotice(jobId: string, fraction: number): Promise<void>;
  stopJobNotice(jobId: string): Promise<void>;
  /** Channel `tool_done`; false when notifications are off. */
  postJobDoneNotice(
    jobId: string,
    title: string,
    body: string,
    channelName: string,
  ): Promise<boolean>;
  cleanToolWorkspace(jobId: string): Promise<void>;
  cleanupToolLeftovers(olderThanMs: number): Promise<number>;
  inspectPdf(uri: string): Promise<PdfLock>;
  checkPdfPassword(uri: string, password: string): Promise<PasswordCheck>;
  /** Workspace files of `jobId` only; writes `in-<index>.open.pdf`. */
  unlockToolInput(
    fileUri: string,
    jobId: string,
    index: number,
    password: string | null,
  ): Promise<WorkspaceFile>;
  /** Workspace files of `jobId` only; `outputsJson` = `[[{"i","p","r"},…],…]`; writes `out-native-<firstOutput + k>.pdf`. */
  assemblePdf(
    jobId: string,
    inputUris: string[],
    outputsJson: string,
    firstOutput: number,
  ): Promise<WorkspaceFile[]>;
  /** Workspace files of `jobId` only; writes `out-compressed.pdf`. */
  compressPdf(fileUri: string, jobId: string, level: CompressLevel): Promise<CompressResult>;
  /** Workspace files of `jobId` only; writes `out-protected.pdf` (AES-256). */
  protectPdf(fileUri: string, jobId: string, password: string): Promise<WorkspaceFile>;
  /** Workspace files of `jobId` only; 1-based page; dpi 72 / 150 / 300; writes `img-<page>.<format>`. */
  renderPdfPage(
    fileUri: string,
    jobId: string,
    page: number,
    dpi: number,
    format: ImageFormat,
  ): Promise<RenderedPage>;
  releasePageExport(): Promise<void>;
  /** Workspace files of `jobId` only (PNGs too); `specJson` = a JSON `StampSpec`; writes `out-stamped.pdf`. */
  stampPdf(fileUri: string, jobId: string, specJson: string): Promise<WorkspaceFile>;
  /** One line of bold text as a transparent PNG (`stamp-text.png`), height clamped 64..512 px. */
  renderTextStamp(
    jobId: string,
    text: string,
    colorArgb: number,
    heightPx: number,
  ): Promise<PreparedPage>;
  /** Image session source → `stamp-image-<sourceIndex>.png` (alpha kept, upright, long side 256..2048). */
  prepareStampImage(
    sessionId: string,
    sourceIndex: number,
    jobId: string,
    maxLongSidePx: number,
  ): Promise<PreparedPage>;
  /** Workspace file → Pictures/PDFToolkit/<folder>/ under a free name; deletes the workspace file. */
  publishImageOutput(tempUri: string, fileName: string, folder: string): Promise<SavedImage>;
  /** filesDir/signatures/sig-*.png only (else ERR_PERMISSION_DENIED); a missing file resolves. */
  deleteSignatureFile(uri: string): Promise<void>;
  shareImages(uris: string[], chooserTitle: string): Promise<void>;
  viewImage(uri: string, chooserTitle: string): Promise<void>;
  /** Workspace files only; 1-based page, width clamped to 1..512; own lane (not reader / Files list). */
  renderToolThumbnail(fileUri: string, page: number, width: number): Promise<string>;
  getToolPageCount(fileUri: string): Promise<number>;
  releaseToolDocument(): Promise<void>;
  /** ACTION_CREATE_DOCUMENT then a streamed copy; false when cancelled; ERR_FILE_EXISTS for a non-empty target. */
  saveCopyAs(uri: string, suggestedName: string): Promise<boolean>;
  /** ACTION_OPEN_DOCUMENT for PDFs; [] when cancelled; ERR_PERMISSION_DENIED when every pick is refused. */
  pickPdfDocuments(multiple: boolean): Promise<string[]>;
  /** System photo picker, images only (max clamped to 1..100); the first `max` picks and how many more were dropped. */
  pickImages(max: number): Promise<PickedImageUris>;
  /** ML Kit document scanner; pages imported as src-<firstIndex + k>; [] when cancelled. */
  scanDocument(sessionId: string, firstIndex: number, pageLimit: number): Promise<ImportedImage[]>;
}

export default requireNativeModule<PdfNativeModule>('PdfNative');
