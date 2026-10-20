import { PixelRatio } from 'react-native';
import { create } from 'zustand';

import { getDb } from '@/db/client';
import type { FileRow } from '@/db/schema';
import {
  applyFolderChanges,
  applyScan,
  deleteBySource,
  getFolderStamps,
  listFiles,
  markOpened as markOpenedInDb,
  removeFile,
  replaceFile,
  setFavorite,
  updateThumb,
  upsertFile,
  type IndexDb,
} from '@/services/index/fileIndexRepo';
import {
  isPdfNativeError,
  pdfNative,
  type PdfNativeApi,
  type ScanProgressEvent,
} from '@/services/native/pdfNative';
import type { FileRef, StorageProvider } from '@/services/storage/StorageProvider';
import { createThumbnailQueue, type ThumbResult } from '@/services/thumbnails/thumbnailQueue';
import { useStorage } from '@/stores/storageStore';

export type FilesStatus = 'idle' | 'loading' | 'scanning';
/** Codes only (mapped to i18n keys by the UI): never file names or paths. */
export type FileActionError = 'notFound' | 'exists' | 'invalidName' | 'permission' | 'unknown';

export type FilesState = {
  files: FileRow[];
  status: FilesStatus;
  progress: ScanProgressEvent | null;
  lastScanAt: number | null;
  notice: FileActionError | null;
  loadFromCache: () => void;
  refresh: (kind: 'full' | 'quick') => Promise<void>;
  toggleFavorite: (id: string) => void;
  markOpened: (id: string) => void;
  rename: (id: string, newName: string) => Promise<FileActionError | null>;
  remove: (id: string) => Promise<FileActionError | null>;
  duplicate: (id: string) => Promise<FileActionError | null>;
  moveToAppFolder: (id: string) => Promise<FileActionError | null>;
  requestThumb: (file: FileRow) => void;
  clearNotice: () => void;
};

export type FilesStoreDeps = {
  getDb: () => IndexDb;
  getProvider: () => StorageProvider | null;
  native: Pick<PdfNativeApi, 'generateThumbnail' | 'getPageCount'>;
  thumbWidth: number;
  now: () => number;
};

function toActionError(e: unknown): FileActionError {
  if (isPdfNativeError(e, 'ERR_FILE_NOT_FOUND')) return 'notFound';
  if (isPdfNativeError(e, 'ERR_FILE_EXISTS')) return 'exists';
  if (isPdfNativeError(e, 'ERR_INVALID_NAME')) return 'invalidName';
  if (isPdfNativeError(e, 'ERR_PERMISSION_DENIED')) return 'permission';
  return 'unknown';
}

type FileOp = (provider: StorageProvider, ref: FileRef, row: FileRow, db: IndexDb) => Promise<void>;

export function createFilesStore(deps: FilesStoreDeps) {
  return create<FilesState>()((set, get) => {
    let inflight: Promise<void> | null = null;

    const reload = () => set({ files: listFiles(deps.getDb()) });

    const patchRow = (id: string, patch: Partial<FileRow>) =>
      set({ files: get().files.map((f) => (f.id === id ? { ...f, ...patch } : f)) });

    const dropRow = (id: string) => set({ files: get().files.filter((f) => f.id !== id) });

    const onThumb = (r: ThumbResult) => {
      try {
        const db = deps.getDb();
        if (r.missing) {
          removeFile(db, r.id);
          dropRow(r.id);
          set({ notice: 'notFound' });
          return;
        }
        const patch = {
          thumbPath: r.thumbPath,
          pageCount: r.pageCount,
          isEncrypted: r.isEncrypted,
          isCorrupt: r.invalid,
        };
        updateThumb(db, r.id, patch);
        patchRow(r.id, patch);
      } catch {
        // DB unavailable: the thumbnail is regenerated on a later launch.
      }
    };

    const thumbs = createThumbnailQueue({
      native: deps.native,
      width: deps.thumbWidth,
      onResult: onThumb,
    });

    async function scan(provider: StorageProvider, kind: 'full' | 'quick'): Promise<void> {
      const started = deps.now();
      try {
        const db = deps.getDb();
        if (kind === 'full') {
          const result = await provider.fullScan((progress) => set({ progress }));
          // Mode switch: rows of the other access mode are dropped; output/intent rows stay.
          deleteBySource(db, provider.source === 'scan' ? 'saf' : 'scan');
          applyScan(db, { result, source: provider.source });
        } else {
          const outcome = await provider.quickScan(getFolderStamps(db));
          if (outcome.kind === 'folders') applyFolderChanges(db, outcome.changes);
          else applyScan(db, { result: outcome.result, source: provider.source });
        }
        const files = listFiles(db);
        set({ files, lastScanAt: deps.now() });
        if (__DEV__) {
          console.log(`[scan] ${kind} ${deps.now() - started}ms ${files.length} files`);
        }
      } catch {
        // Keep the previous list; the next foreground or pull-to-refresh retries.
      } finally {
        set({ status: 'idle', progress: null });
      }
    }

    async function runFileOp(id: string, op: FileOp): Promise<FileActionError | null> {
      const provider = deps.getProvider();
      if (!provider) return 'permission';
      const row = get().files.find((f) => f.id === id);
      if (!row) return 'notFound';
      try {
        const db = deps.getDb();
        await op(provider, { uri: row.uri, parentUri: row.parentUri }, row, db);
        reload();
        return null;
      } catch (e) {
        const error = toActionError(e);
        if (error === 'notFound') {
          // Deleted outside the app between the scan and this action.
          try {
            removeFile(deps.getDb(), id);
          } catch {
            // The next scan removes it.
          }
          dropRow(id);
        }
        return error;
      }
    }

    return {
      files: [],
      status: 'loading',
      progress: null,
      lastScanAt: null,
      notice: null,

      loadFromCache() {
        const files = listFiles(deps.getDb());
        set({ files, status: get().status === 'scanning' ? 'scanning' : 'idle' });
      },

      refresh(kind) {
        if (inflight) return inflight;
        const provider = deps.getProvider();
        if (!provider) return Promise.resolve();
        set({ status: 'scanning', progress: null });
        inflight = scan(provider, kind).finally(() => {
          inflight = null;
        });
        return inflight;
      },

      toggleFavorite(id) {
        const row = get().files.find((f) => f.id === id);
        if (!row) return;
        setFavorite(deps.getDb(), id, !row.isFavorite);
        patchRow(id, { isFavorite: !row.isFavorite });
      },

      markOpened(id) {
        const at = deps.now();
        markOpenedInDb(deps.getDb(), id, at);
        patchRow(id, { lastOpenedAt: at });
      },

      rename: (id, newName) =>
        runFileOp(id, async (provider, ref, row, db) => {
          replaceFile(db, id, await provider.rename(ref, newName), row.source);
        }),

      remove: (id) =>
        runFileOp(id, async (provider, ref, _row, db) => {
          await provider.remove(ref);
          removeFile(db, id);
        }),

      duplicate: (id) =>
        runFileOp(id, async (provider, ref, _row, db) => {
          upsertFile(db, await provider.duplicate(ref), provider.source);
        }),

      moveToAppFolder: (id) =>
        runFileOp(id, async (provider, ref, _row, db) => {
          const info = await provider.moveToAppFolder(ref);
          // The app folder is outside the granted SAF trees, so it is tracked as output there.
          replaceFile(db, id, info, provider.mode === 'saf' ? 'output' : provider.source);
        }),

      requestThumb(file) {
        if (file.thumbPath || file.isEncrypted || file.isCorrupt) return;
        thumbs.request(file);
      },

      clearNotice() {
        set({ notice: null });
      },
    };
  });
}

export const useFiles = createFilesStore({
  getDb,
  getProvider: () => useStorage.getState().provider(),
  native: pdfNative,
  thumbWidth: Math.min(200, Math.round(48 * PixelRatio.get())),
  now: Date.now,
});
