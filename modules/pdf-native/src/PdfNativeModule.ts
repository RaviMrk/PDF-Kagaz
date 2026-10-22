import { NativeModule, requireNativeModule } from 'expo';

import type {
  FolderChange,
  PdfFileInfo,
  PdfNativeModuleEvents,
  PickedFolder,
  ReaderFile,
  ScanResult,
  StagedInput,
} from './PdfNative.types';

declare class PdfNativeModule extends NativeModule<PdfNativeModuleEvents> {
  scanPdfs(roots?: string[] | null): Promise<ScanResult>;
  /** Known folder stamps as parallel arrays (uris[i] was stamped with modifiedAts[i]). */
  scanChangedFolders(uris: string[], modifiedAts: number[]): Promise<FolderChange[]>;
  hasAllFilesAccess(): Promise<boolean>;
  openAllFilesAccessSettings(): Promise<void>;
  generateThumbnail(uri: string, page: number, width: number): Promise<string>;
  getPageCount(uri: string, password?: string | null): Promise<number>;
  prepareReaderFile(uri: string): Promise<ReaderFile>;
  /** 1-based page, width clamped to 1..512; serialized apart from generateThumbnail. */
  renderReaderThumbnail(fileUri: string, page: number, width: number): Promise<string>;
  releaseReaderDocument(): Promise<void>;
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
  publishToolOutput(tempUri: string, fileName: string): Promise<PdfFileInfo>;
  cleanToolWorkspace(jobId: string): Promise<void>;
  cleanupToolLeftovers(olderThanMs: number): Promise<number>;
}

export default requireNativeModule<PdfNativeModule>('PdfNative');
