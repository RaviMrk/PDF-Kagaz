import { PermissionsAndroid, Platform } from 'react-native';
import { create } from 'zustand';

import { allFilesAccessEnabled } from '@/config/appVariant';
import { getDb } from '@/db/client';
import { pdfNative } from '@/services/native/pdfNative';
import { createFullAccessProvider } from '@/services/storage/FullAccessProvider';
import { createSafProvider } from '@/services/storage/SafProvider';
import type {
  ScanRootView,
  StorageMode,
  StorageProvider,
} from '@/services/storage/StorageProvider';
import { resolveStorageMode } from '@/services/storage/resolveStorageMode';
import { waitForForeground } from '@/services/storage/waitForForeground';

export type StorageState = {
  mode: StorageMode | 'none' | 'unknown';
  roots: ScanRootView[];
  canRequestFullAccess: boolean;
  refreshMode: () => Promise<StorageMode | 'none'>;
  requestFullAccess: () => Promise<boolean>;
  addFolder: () => Promise<boolean>;
  removeFolder: (uri: string) => Promise<void>;
  provider: () => StorageProvider | null;
};

export type StorageStoreDeps = {
  full: StorageProvider;
  saf: StorageProvider;
  apiLevel: number;
  allFilesAccessEnabled: boolean;
};

export function createStorageStore(deps: StorageStoreDeps) {
  const { full, saf } = deps;
  return create<StorageState>()((set, get) => {
    const refreshMode = async (): Promise<StorageMode | 'none'> => {
      const roots = await saf.listRoots().catch(() => [] as ScanRootView[]);
      const mode = await resolveStorageMode({
        hasAllFilesAccess: () => full.hasAccess(),
        grantedRootCount: () => Promise.resolve(roots.filter((r) => r.granted).length),
      });
      set({ mode, roots });
      return mode;
    };
    return {
      mode: 'unknown',
      roots: [],
      canRequestFullAccess: deps.apiLevel < 30 || deps.allFilesAccessEnabled,
      refreshMode,
      async requestFullAccess() {
        let granted = false;
        try {
          granted = await full.requestAccess();
        } finally {
          await refreshMode();
        }
        return granted;
      },
      async addFolder() {
        let added = false;
        try {
          added = await saf.requestAccess();
        } finally {
          await refreshMode();
        }
        return added;
      },
      async removeFolder(uri) {
        try {
          await saf.removeRoot(uri);
        } finally {
          await refreshMode();
        }
      },
      provider() {
        const { mode } = get();
        if (mode === 'full') return full;
        if (mode === 'saf') return saf;
        return null;
      },
    };
  });
}

const apiLevel = Platform.Version as number;

export const useStorage = createStorageStore({
  full: createFullAccessProvider({
    native: pdfNative,
    apiLevel,
    permissions: PermissionsAndroid,
    waitForForeground,
  }),
  saf: createSafProvider({ native: pdfNative, getDb, now: Date.now }),
  apiLevel,
  allFilesAccessEnabled: allFilesAccessEnabled(),
});
