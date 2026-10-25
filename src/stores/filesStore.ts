import { PixelRatio } from 'react-native';
import { create } from 'zustand';

import { getDb } from '@/db/client';
import type { FileRow } from '@/db/schema';
import {
  applyFolderChanges,
  applyScan,
  deleteBySource,
  clearThumbPaths,
  getFile,
  getFolderStamps,
  listFiles,
  markOpened as markOpenedInDb,
  removeFile,
  replaceFile,
  setFavorite,
  setLastPage as setLastPageInDb,
  updateThumb,
  upsertFile,
  type IndexDb,
  type ScanDiff,
} from '@/services/index/fileIndexRepo';
import {
  isPdfNativeError,
  pdfNative,
  type PdfFileInfo,
  type PdfNativeApi,
  type ScanProgressEvent,
} from '@/services/native/pdfNative';
import type { FileRef, StorageProvider } from '@/services/storage/StorageProvider';
import { createThumbnailQueue, type ThumbResult } from '@/services/thumbnails/thumbnailQueue';
import { useStorage } from '@/stores/storageStore';
import { fileIdForUri } from '@/utils/fileId';

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
  /**
   * Old id → new id for each rename this session (a row's id comes from its uri), so a screen
   * holding an id (the reader) can follow the file. Read it with `followRenames`.
   */
  renames: Record<string, string>;
  loadFromCache: () => void;
  refresh: (kind: 'full' | 'quick') => Promise<void>;
  toggleFavorite: (id: string) => void;
  markOpened: (id: string) => void;
  rename: (id: string, newName: string) => Promise<FileActionError | null>;
  remove: (id: string) => Promise<FileActionError | null>;
  duplicate: (id: string) => Promise<FileActionError | null>;
  moveToAppFolder: (id: string) => Promise<FileActionError | null>;
  /** The row from state, else from the DB (e.g. a reader opened before the list loaded). */
  getRow: (id: string) => FileRow | null;
  setLastPage: (id: string, page: number) => void;
  /**
   * Drops a row whose file is gone. Callers pass only an id whose open failed with a confirmed
   * ERR_FILE_NOT_FOUND; ERR_VOLUME_UNAVAILABLE, ERR_IO and ERR_PERMISSION_DENIED keep the row.
   */
  dropMissing: (id: string) => void;
  /** Registers a PDF handed to the app (share/open-with): reuses an indexed row, else adds an 'intent' row. */
  registerIncoming: (info: PdfFileInfo) => FileRow | null;
  /** Indexes finished tool outputs as 'output' rows (under the writer lock). DB error: [] (next scan adopts them). */
  registerOutputs: (infos: PdfFileInfo[]) => Promise<FileRow[]>;
  /**
   * Indexes documents chosen in the picker (foreign content:// URIs with only a transient grant,
   * so callers must stage them immediately). Failures are counted, never thrown.
   */
  addPickedDocuments: (uris: string[]) => Promise<{ rows: FileRow[]; failed: number }>;
  /** Rows for the given ids, in order; unknown ids are skipped. */
  getRows: (ids: string[]) => FileRow[];
  requestThumb: (file: FileRow) => void;
  /** The stored thumbnail file could not be loaded (cache cleared): regenerate it once. */
  thumbMissing: (id: string) => void;
  /** The thumbnail cache was cleared: forget every thumbPath and regenerate visible rows. */
  resetThumbnails: () => void;
  clearNotice: () => void;
  reportError: (error: FilesError) => void;
};

/** The id a row has now, after any renames since `id` was taken. */
export function followRenames(renames: Readonly<Record<string, string>>, id: string): string {
  let current = id;
  const seen = new Set<string>([current]);
  for (let next = renames[current]; next !== undefined; next = renames[current]) {
    if (seen.has(next)) break;
    seen.add(next);
    current = next;
  }
  return current;
}

export type FilesStoreDeps = {
  getDb: () => IndexDb;
  getProvider: () => StorageProvider | null;
  native: Pick<
    PdfNativeApi,
    'generateThumbnail' | 'getPageCount' | 'releaseIncomingGrant' | 'resolveIncomingPdf'
  >;
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

/** Rows regenerated at once after a cache clear; the rest follow as the list renders them. */
const RESET_REQUEUE = 48;

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

    /** Best-effort: persisted incoming grants must not accumulate once their row is gone. */
    const releaseGrant = (row: Pick<FileRow, 'source' | 'uri'>) => {
      if (row.source !== 'intent') return;
      try {
        deps.native.releaseIncomingGrant(row.uri).catch(() => {});
      } catch {
        // Ignored: nothing to do if the grant is already gone.
      }
    };

    /** Writes a batch of thumbnail results in one transaction and publishes them in one update. */
    const applyThumbs = (results: ThumbResult[]) => {
      const patches = new Map<string, Partial<FileRow>>();
      const removed = new Set<string>();
      const removedIntent: FileRow[] = [];
      try {
        deps.getDb().transaction((tx) => {
          for (const r of results) {
            const row = getFile(tx, r.id);
            // Generated from content that a rescan has since replaced: drop the stale result.
            if (!row || row.modifiedAt !== r.modifiedAt || row.sizeBytes !== r.sizeBytes) continue;
            if (r.missing) {
              removeFile(tx, r.id);
              removed.add(r.id);
              removedIntent.push(row);
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
      removedIntent.forEach(releaseGrant);
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
      let row: FileRow | undefined;
      try {
        const db = deps.getDb();
        // Read inside the lock: a scan that just finished may have changed the row.
        row = getFile(db, id);
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
            if (row) releaseGrant(row);
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
      renames: {},

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

      // Reader actions below are synchronous: each DB write is one statement/transaction and the
      // scan applies its result and re-lists in one synchronous block, so none can interleave
      // with a scan or file action (those only yield at awaits) and none of them is overwritten
      // by a stale scan result. Like the actions above they never throw.
      getRow(id) {
        const row = get().files.find((f) => f.id === id);
        if (row) return row;
        try {
          return getFile(deps.getDb(), id) ?? null;
        } catch {
          return null;
        }
      },

      setLastPage(id, page) {
        try {
          setLastPageInDb(deps.getDb(), id, page);
        } catch {
          return; // Losing a resume position is not worth a notice.
        }
        patchRow(id, { lastPage: page });
      },

      dropMissing(id) {
        let row: FileRow | undefined;
        try {
          const db = deps.getDb();
          row = getFile(db, id);
          removeFile(db, id);
        } catch {
          // The next scan removes it; the list still drops it for now.
        }
        if (row) releaseGrant(row);
        dropRow(id);
        set({ notice: 'notFound' });
      },

      registerIncoming(info) {
        const id = fileIdForUri(info.uri);
        let row: FileRow | undefined;
        try {
          const db = deps.getDb();
          row = getFile(db, id) ?? upsertFile(db, info, 'intent');
          markOpenedInDb(db, id, deps.now());
          row = getFile(db, id) ?? row;
        } catch {
          return null;
        }
        const fresh = row;
        const list = get().files;
        set({
          files: list.some((f) => f.id === id)
            ? list.map((f) => (f.id === id ? fresh : f))
            : [...list, fresh],
        });
        return fresh;
      },

      registerOutputs: (infos) =>
        exclusive(async () => {
          try {
            const rows = deps
              .getDb()
              .transaction((tx) => infos.map((info) => upsertFile(tx, info, 'output')));
            const byId = new Map(rows.map((r) => [r.id, r]));
            const list = get().files;
            set({
              files: [
                ...list.map((f) => byId.get(f.id) ?? f),
                ...rows.filter((r) => !list.some((f) => f.id === r.id)),
              ],
            });
            return rows;
          } catch {
            return [];
          }
        }),

      async addPickedDocuments(uris) {
        const rows: FileRow[] = [];
        let failed = 0;
        for (const uri of uris) {
          try {
            const db = deps.getDb();
            const info = await deps.native.resolveIncomingPdf(uri);
            rows.push(getFile(db, fileIdForUri(info.uri)) ?? upsertFile(db, info, 'intent'));
          } catch {
            failed += 1;
          }
        }
        const list = get().files;
        const have = new Set(list.map((f) => f.id));
        const added = rows.filter(
          (r, i) => !have.has(r.id) && rows.findIndex((x) => x.id === r.id) === i,
        );
        if (added.length > 0) set({ files: [...list, ...added] });
        return { rows, failed };
      },

      getRows(ids) {
        const out: FileRow[] = [];
        for (const id of ids) {
          const row = get().getRow(id);
          if (row) out.push(row);
        }
        return out;
      },

      rename: (id, newName) =>
        runFileOp(id, async (provider, ref, row, db) => {
          const next = replaceFile(db, id, await provider.rename(ref, newName), row.source);
          if (next.id === id) return;
          // The new id is live again: drop any entry that would lead away from it.
          const { [next.id]: _stale, ...renames } = get().renames;
          set({ renames: { ...renames, [id]: next.id } });
        }),

      remove: (id) =>
        runFileOp(id, async (provider, ref, row, db) => {
          await provider.remove(ref);
          removeFile(db, id);
          releaseGrant(row);
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

      resetThumbnails() {
        const before = get().files;
        try {
          clearThumbPaths(deps.getDb());
        } catch {
          // DB unavailable: the stored paths are dropped on the next thumbMissing.
        }
        thumbRetried.clear();
        thumbs.reset();
        set({ files: before.map((f) => (f.thumbPath ? { ...f, thumbPath: null } : f)) });
        // The list re-requests rows as they render; warm the first screens now.
        before
          .filter((f) => f.thumbPath && !f.isEncrypted && !f.isCorrupt)
          .slice(0, RESET_REQUEUE)
          .forEach((f) => thumbs.request(f));
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
