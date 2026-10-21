import { PixelRatio } from 'react-native';
import { create } from 'zustand';

import { getDb } from '@/db/client';
import type { FileRow } from '@/db/schema';
import {
  applyFolderChanges,
  applyScan,
  deleteBySource,
  getFile,
  getFolderStamps,
  listFiles,
  markOpened as markOpenedInDb,
  removeFile,
  replaceFile,
  setFavorite,
  updateThumb,
  upsertFile,
  type IndexDb,
  type ScanDiff,
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
export type FileActionError =
  'notFound' | 'unavailable' | 'exists' | 'invalidName' | 'permission' | 'unknown';
/** Index-level failure the UI can show: the cached list could not be read, or a scan failed. */
export type FilesError = 'cache' | 'scan';

export type FilesState = {
  files: FileRow[];
  status: FilesStatus;
  progress: ScanProgressEvent | null;
  lastScanAt: number | null;
  notice: FileActionError | null;
  error: FilesError | null;
  loadFromCache: () => void;
  refresh: (kind: 'full' | 'quick') => Promise<void>;
  toggleFavorite: (id: string) => void;
  markOpened: (id: string) => void;
  rename: (id: string, newName: string) => Promise<FileActionError | null>;
  remove: (id: string) => Promise<FileActionError | null>;
  duplicate: (id: string) => Promise<FileActionError | null>;
  moveToAppFolder: (id: string) => Promise<FileActionError | null>;
  requestThumb: (file: FileRow) => void;
  /** The stored thumbnail file could not be loaded (cache cleared): regenerate it once. */
  thumbMissing: (id: string) => void;
  clearNotice: () => void;
  reportError: (error: FilesError) => void;
};

export type FilesStoreDeps = {
  getDb: () => IndexDb;
  getProvider: () => StorageProvider | null;
  native: Pick<PdfNativeApi, 'generateThumbnail' | 'getPageCount'>;
  thumbWidth: number;
  now: () => number;
  /**
   * When set, thumbnail results are collected and applied together (one DB transaction, one
   * store update) at most this often, instead of one list re-render per thumbnail.
   */
  thumbFlushMs?: number;
};

function toActionError(e: unknown): FileActionError {
  if (isPdfNativeError(e, 'ERR_FILE_NOT_FOUND')) return 'notFound';
  // On a volume that is not mounted (SD card removed): the file is not gone, the row stays.
  if (isPdfNativeError(e, 'ERR_VOLUME_UNAVAILABLE')) return 'unavailable';
  if (isPdfNativeError(e, 'ERR_FILE_EXISTS')) return 'exists';
  if (isPdfNativeError(e, 'ERR_INVALID_NAME')) return 'invalidName';
  if (isPdfNativeError(e, 'ERR_PERMISSION_DENIED')) return 'permission';
  return 'unknown';
}

type FileOp = (provider: StorageProvider, ref: FileRef, row: FileRow, db: IndexDb) => Promise<void>;

export function createFilesStore(deps: FilesStoreDeps) {
  return create<FilesState>()((set, get) => {
    let running: { kind: 'full' | 'quick'; promise: Promise<void> } | null = null;
    let queuedFull: Promise<void> | null = null;

    // Index writers (scans and file actions) run one at a time: a scan result listed before a
    // rename must not be applied after it, or it would resurrect the old row and drop the new one.
    let writerTail: Promise<unknown> = Promise.resolve();
    function exclusive<T>(fn: () => Promise<T>): Promise<T> {
      const run = writerTail.then(fn);
      writerTail = run.catch(() => {});
      return run;
    }

    // True once `files` mirrors the DB; until then a no-change scan must still list it.
    let listed = false;

    const reload = () => {
      set({ files: listFiles(deps.getDb()) });
      listed = true;
    };

    const patchRow = (id: string, patch: Partial<FileRow>) =>
      set({ files: get().files.map((f) => (f.id === id ? { ...f, ...patch } : f)) });

    const dropRow = (id: string) => set({ files: get().files.filter((f) => f.id !== id) });

    /** Writes a batch of thumbnail results in one transaction and publishes them in one update. */
    const applyThumbs = (results: ThumbResult[]) => {
      const patches = new Map<string, Partial<FileRow>>();
      const removed = new Set<string>();
      try {
        deps.getDb().transaction((tx) => {
          for (const r of results) {
            const row = getFile(tx, r.id);
            // Generated from content that a rescan has since replaced: drop the stale result.
            if (!row || row.modifiedAt !== r.modifiedAt || row.sizeBytes !== r.sizeBytes) continue;
            if (r.missing) {
              removeFile(tx, r.id);
              removed.add(r.id);
              continue;
            }
            const patch = {
              thumbPath: r.thumbPath,
              pageCount: r.pageCount,
              isEncrypted: r.isEncrypted,
              isCorrupt: r.invalid,
            };
            updateThumb(tx, r.id, patch);
            patches.set(r.id, patch);
          }
        });
      } catch {
        // DB unavailable: the thumbnails are regenerated on a later launch.
        return;
      }
      if (patches.size === 0 && removed.size === 0) return;
      const files = get()
        .files.filter((f) => !removed.has(f.id))
        .map((f) => {
          const patch = patches.get(f.id);
          return patch ? { ...f, ...patch } : f;
        });
      set(removed.size > 0 ? { files, notice: 'notFound' } : { files });
    };

    let pendingThumbs: ThumbResult[] = [];
    let thumbTimer: ReturnType<typeof setTimeout> | null = null;
    const onThumb = (r: ThumbResult) => {
      if (!deps.thumbFlushMs) {
        applyThumbs([r]);
        return;
      }
      pendingThumbs.push(r);
      thumbTimer ??= setTimeout(() => {
        thumbTimer = null;
        const batch = pendingThumbs;
        pendingThumbs = [];
        applyThumbs(batch);
      }, deps.thumbFlushMs);
    };

    const thumbs = createThumbnailQueue({
      native: deps.native,
      width: deps.thumbWidth,
      onResult: onThumb,
    });

    // Rows whose thumbnail was regenerated after its cached file vanished: at most once per session.
    const thumbRetried = new Set<string>();

    async function scan(provider: StorageProvider, kind: 'full' | 'quick'): Promise<void> {
      const started = deps.now();
      try {
        const db = deps.getDb();
        let diff: ScanDiff;
        if (kind === 'full') {
          const result = await provider.fullScan((progress) => set({ progress }));
          // Mode switch: rows of the other access mode are dropped; output/intent rows stay.
          const dropped = deleteBySource(db, provider.source === 'scan' ? 'saf' : 'scan');
          diff = applyScan(db, { result, source: provider.source });
          diff = { ...diff, removed: diff.removed + dropped };
        } else {
          const outcome = await provider.quickScan(getFolderStamps(db));
          diff =
            outcome.kind === 'folders'
              ? applyFolderChanges(db, outcome.changes)
              : applyScan(db, { result: outcome.result, source: provider.source });
        }
        // Nothing changed: keep the current array so lists do not re-render (and skip listing ~1,000 rows).
        const changed = diff.added + diff.updated + diff.removed > 0;
        const files = changed || !listed ? listFiles(db) : null;
        set(
          files
            ? { files, lastScanAt: deps.now(), error: null }
            : { lastScanAt: deps.now(), error: null },
        );
        if (files) listed = true;
        if (__DEV__) {
          const n = get().files.length;
          console.log(`[scan] ${kind} ${deps.now() - started}ms ${n} files`);
        }
      } catch {
        // Keep the previous list; the next foreground or pull-to-refresh retries.
        set({ error: 'scan' });
      } finally {
        set({ status: 'idle', progress: null });
      }
    }

    function startScan(kind: 'full' | 'quick'): Promise<void> {
      const provider = deps.getProvider();
      if (!provider) return Promise.resolve();
      set({ status: 'scanning', progress: null });
      const promise: Promise<void> = exclusive(() => scan(provider, kind)).finally(() => {
        if (running?.promise === promise) running = null;
      });
      running = { kind, promise };
      return promise;
    }

    function runFileOp(id: string, op: FileOp): Promise<FileActionError | null> {
      return exclusive(() => fileOp(id, op));
    }

    async function fileOp(id: string, op: FileOp): Promise<FileActionError | null> {
      const provider = deps.getProvider();
      if (!provider) return 'permission';
      try {
        const db = deps.getDb();
        // Read inside the lock: a scan that just finished may have changed the row.
        const row = getFile(db, id);
        if (!row) {
          dropRow(id);
          return 'notFound';
        }
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
      error: null,

      loadFromCache() {
        const status = get().status === 'scanning' ? 'scanning' : 'idle';
        try {
          set({ files: listFiles(deps.getDb()), status });
          listed = true;
        } catch {
          set({ status, error: 'cache' });
        }
      },

      refresh(kind) {
        if (queuedFull) return queuedFull;
        if (!running) return startScan(kind);
        if (kind === 'quick' || running.kind === 'full') return running.promise;
        // A full (e.g. after a mode switch) must not be lost to a running quick: run it next.
        const next = running.promise.then(() => {
          queuedFull = null;
          return startScan('full');
        });
        queuedFull = next;
        return next;
      },

      // Called from press handlers: a DB error must not throw (fatal in release builds).
      toggleFavorite(id) {
        const row = get().files.find((f) => f.id === id);
        if (!row) return;
        try {
          setFavorite(deps.getDb(), id, !row.isFavorite);
        } catch {
          set({ notice: 'unknown' });
          return;
        }
        patchRow(id, { isFavorite: !row.isFavorite });
      },

      markOpened(id) {
        const at = deps.now();
        try {
          markOpenedInDb(deps.getDb(), id, at);
        } catch {
          set({ notice: 'unknown' });
          return;
        }
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

      thumbMissing(id) {
        const row = get().files.find((f) => f.id === id);
        if (!row?.thumbPath) return;
        try {
          updateThumb(deps.getDb(), id, { thumbPath: null });
        } catch {
          // DB unavailable: the next launch tries the stored path again.
        }
        patchRow(id, { thumbPath: null });
        if (thumbRetried.has(id)) return; // Still unloadable: keep the placeholder icon.
        thumbRetried.add(id);
        if (!row.isEncrypted && !row.isCorrupt) thumbs.retry(row);
      },

      clearNotice() {
        set({ notice: null });
      },

      reportError(error) {
        set({ error, status: get().status === 'scanning' ? 'scanning' : 'idle' });
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
  thumbFlushMs: 250,
});
