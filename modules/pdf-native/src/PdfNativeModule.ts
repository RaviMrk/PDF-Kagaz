import { NativeModule, requireNativeModule } from 'expo';

import type {
  FolderChange,
  FolderStamp,
  PdfFileInfo,
  PdfNativeModuleEvents,
  PickedFolder,
  ScanResult,
} from './PdfNative.types';

declare class PdfNativeModule extends NativeModule<PdfNativeModuleEvents> {
  scanPdfs(roots?: string[] | null): Promise<ScanResult>;
  scanChangedFolders(known: FolderStamp[]): Promise<FolderChange[]>;
  hasAllFilesAccess(): Promise<boolean>;
  openAllFilesAccessSettings(): Promise<void>;
  generateThumbnail(uri: string, page: number, width: number): Promise<string>;
  getPageCount(uri: string, password?: string | null): Promise<number>;
  renameFile(uri: string, newName: string): Promise<PdfFileInfo>;
  deleteFile(uri: string): Promise<void>;
  duplicateFile(uri: string, parentUri: string): Promise<PdfFileInfo>;
  moveToAppFolder(uri: string): Promise<PdfFileInfo>;
  pickFolder(): Promise<PickedFolder | null>;
  releaseFolder(uri: string): Promise<void>;
  getPersistedFolderUris(): Promise<string[]>;
}

export default requireNativeModule<PdfNativeModule>('PdfNative');
