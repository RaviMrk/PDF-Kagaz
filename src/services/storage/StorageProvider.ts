import type {
  FolderChange,
  FolderStamp,
  PdfFileInfo,
  ScanProgressEvent,
  ScanResult,
} from '@/services/native/pdfNative';

export type StorageMode = 'full' | 'saf';

export type FileRef = { uri: string; parentUri: string | null };

export type ScanRootView = { uri: string; label: string; granted: boolean };

export type QuickScanOutcome =
  { kind: 'folders'; changes: FolderChange[] } | { kind: 'full'; result: ScanResult };

export interface StorageProvider {
  readonly mode: StorageMode;
  readonly source: 'scan' | 'saf';
  hasAccess(): Promise<boolean>;
  requestAccess(): Promise<boolean>;
  fullScan(onProgress?: (e: ScanProgressEvent) => void): Promise<ScanResult>;
  quickScan(stamps: FolderStamp[]): Promise<QuickScanOutcome>;
  rename(file: FileRef, newName: string): Promise<PdfFileInfo>;
  remove(file: FileRef): Promise<void>;
  duplicate(file: FileRef): Promise<PdfFileInfo>;
  moveToAppFolder(file: FileRef): Promise<PdfFileInfo>;
  listRoots(): Promise<ScanRootView[]>;
  addRoot(): Promise<ScanRootView | null>;
  removeRoot(uri: string): Promise<void>;
}

/** Parent folder of a file:// uri; SAF document uris must carry an explicit parentUri. */
export function parentOf(file: FileRef): string {
  if (file.parentUri) return file.parentUri;
  const slash = file.uri.lastIndexOf('/');
  if (file.uri.startsWith('file://') && slash > 'file://'.length) return file.uri.slice(0, slash);
  throw new Error(`Cannot determine parent folder of ${file.uri}`);
}
