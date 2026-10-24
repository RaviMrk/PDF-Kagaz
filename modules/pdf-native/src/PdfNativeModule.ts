import { NativeModule, requireNativeModule } from 'expo';

import type {
  FolderChange,
  ImportedImage,
  PdfFileInfo,
  PdfNativeModuleEvents,
  PickedFolder,
  PickedImageUris,
  PreparedPage,
  ReaderFile,
  ScanResult,
  StagedInput,
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
  cleanToolWorkspace(jobId: string): Promise<void>;
  cleanupToolLeftovers(olderThanMs: number): Promise<number>;
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
