import type { PermissionsAndroid } from 'react-native';

import type { PdfNativeApi, ScanProgressEvent } from '@/services/native/pdfNative';

import { parentOf, type StorageProvider } from './StorageProvider';

export type FullAccessDeps = {
  native: PdfNativeApi;
  apiLevel: number;
  permissions: Pick<typeof PermissionsAndroid, 'requestMultiple' | 'PERMISSIONS' | 'RESULTS'>;
  waitForForeground: () => Promise<void>;
};

export function createFullAccessProvider(deps: FullAccessDeps): StorageProvider {
  const { native, apiLevel, permissions } = deps;

  async function hasAccess(): Promise<boolean> {
    try {
      return await native.hasAllFilesAccess();
    } catch {
      return false;
    }
  }

  return {
    mode: 'full',
    source: 'scan',
    hasAccess,
    async requestAccess() {
      try {
        if (apiLevel >= 30) {
          await native.openAllFilesAccessSettings();
          await deps.waitForForeground();
          return await hasAccess();
        }
        const { READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE } = permissions.PERMISSIONS;
        const result = await permissions.requestMultiple([
          READ_EXTERNAL_STORAGE,
          WRITE_EXTERNAL_STORAGE,
        ]);
        return result[READ_EXTERNAL_STORAGE] === permissions.RESULTS.GRANTED;
      } catch {
        return false;
      }
    },
    async fullScan(onProgress?: (e: ScanProgressEvent) => void) {
      const sub = onProgress ? native.addScanProgressListener(onProgress) : null;
      try {
        return await native.scanPdfs(null);
      } finally {
        sub?.remove();
      }
    },
    async quickScan(stamps) {
      return { kind: 'folders', changes: await native.scanChangedFolders(stamps) };
    },
    rename: (file, newName) => native.renameFile(file.uri, newName),
    remove: (file) => native.deleteFile(file.uri),
    duplicate: (file) => native.duplicateFile(file.uri, parentOf(file)),
    moveToAppFolder: (file) => native.moveToAppFolder(file.uri),
    listRoots: () => Promise.resolve([]),
    addRoot: () => Promise.resolve(null),
    removeRoot: () => Promise.resolve(),
  };
}
