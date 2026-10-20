import type { IndexDb } from '@/services/index/fileIndexRepo';
import { addScanRoot, listScanRoots, removeScanRoot } from '@/services/index/fileIndexRepo';
import type { PdfNativeApi, ScanProgressEvent, ScanResult } from '@/services/native/pdfNative';

import { parentOf, type ScanRootView, type StorageProvider } from './StorageProvider';

export type SafDeps = {
  native: PdfNativeApi;
  getDb: () => IndexDb;
  now: () => number;
};

export function createSafProvider(deps: SafDeps): StorageProvider {
  const { native } = deps;

  async function listRoots(): Promise<ScanRootView[]> {
    const persisted = new Set(await native.getPersistedFolderUris());
    return listScanRoots(deps.getDb()).map((r) => ({
      uri: r.uri,
      label: r.label,
      granted: persisted.has(r.uri),
    }));
  }

  async function addRoot(): Promise<ScanRootView | null> {
    const picked = await native.pickFolder();
    if (!picked) return null;
    addScanRoot(deps.getDb(), { uri: picked.uri, label: picked.label, addedAt: deps.now() });
    return { uri: picked.uri, label: picked.label, granted: true };
  }

  async function fullScan(onProgress?: (e: ScanProgressEvent) => void): Promise<ScanResult> {
    const roots = await listRoots();
    const granted = roots.filter((r) => r.granted).map((r) => r.uri);
    const lost = roots.filter((r) => !r.granted).map((r) => r.uri);
    // Never pass [] to native: it would scan all volumes.
    if (granted.length === 0) return { files: [], scannedRoots: [], failedRoots: lost };
    const sub = onProgress ? native.addScanProgressListener(onProgress) : null;
    try {
      const result = await native.scanPdfs(granted);
      return { ...result, failedRoots: [...result.failedRoots, ...lost] };
    } finally {
      sub?.remove();
    }
  }

  return {
    mode: 'saf',
    source: 'saf',
    async hasAccess() {
      return (await listRoots()).some((r) => r.granted);
    },
    async requestAccess() {
      return (await addRoot()) !== null;
    },
    fullScan,
    async quickScan() {
      return { kind: 'full', result: await fullScan() };
    },
    rename: (file, newName) => native.renameFile(file.uri, newName),
    remove: (file) => native.deleteFile(file.uri),
    duplicate: (file) => native.duplicateFile(file.uri, parentOf(file)),
    moveToAppFolder: (file) => native.moveToAppFolder(file.uri),
    listRoots,
    addRoot,
    async removeRoot(uri) {
      await native.releaseFolder(uri);
      removeScanRoot(deps.getDb(), uri);
    },
  };
}
