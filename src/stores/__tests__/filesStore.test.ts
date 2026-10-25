import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { bookmarks, files } from '@/db/schema';
import {
  applyScan,
  getFile,
  listFiles,
  setFavorite,
  upsertFile,
  type IndexDb,
} from '@/services/index/fileIndexRepo';
import type { PdfFileInfo, ScanResult } from '@/services/native/pdfNative';
import type { StorageProvider } from '@/services/storage/StorageProvider';
import { createFakePdfNative, nativeError } from '@/test-utils/fakePdfNative';
import { fileIdForUri } from '@/utils/fileId';

import { createFilesStore } from '../filesStore';

function makeDb(): IndexDb {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = OFF');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  sqlite.pragma('foreign_keys = ON');
  return db;
}

const ROOT = 'file:///storage/emulated/0';

function info(path: string, overrides: Partial<PdfFileInfo> = {}): PdfFileInfo {
  const uri = `${ROOT}/${path}`;
  const slash = uri.lastIndexOf('/');
  const parentUri = uri.slice(0, slash);
  return {
    uri,
    name: uri.slice(slash + 1),
    folder: parentUri.slice(parentUri.lastIndexOf('/') + 1),
    parentUri,
    parentModifiedAt: 1000,
    sizeBytes: 100,
    modifiedAt: 5000,
    ...overrides,
  };
}

const result = (fs: PdfFileInfo[]): ScanResult => ({
  files: fs,
  scannedRoots: [ROOT],
  failedRoots: [],
});

const idOf = (path: string) => fileIdForUri(`${ROOT}/${path}`);

function fakeProvider(
  over: Partial<StorageProvider> = {},
): jest.Mocked<StorageProvider> & StorageProvider {
  return {
    mode: 'full',
    source: 'scan',
    hasAccess: jest.fn().mockResolvedValue(true),
    requestAccess: jest.fn().mockResolvedValue(true),
    fullScan: jest.fn().mockResolvedValue(result([])),
    quickScan: jest.fn().mockResolvedValue({ kind: 'folders', changes: [] }),
    rename: jest.fn(),
    remove: jest.fn().mockResolvedValue(undefined),
    duplicate: jest.fn(),
    moveToAppFolder: jest.fn(),
    listRoots: jest.fn().mockResolvedValue([]),
    addRoot: jest.fn().mockResolvedValue(null),
    removeRoot: jest.fn().mockResolvedValue(undefined),
    ...over,
  } as jest.Mocked<StorageProvider> & StorageProvider;
}

function setup(
  opts: { provider?: StorageProvider | null; seed?: PdfFileInfo[]; thumbFlushMs?: number } = {},
) {
  const db = makeDb();
  if (opts.seed) applyScan(db, { result: result(opts.seed), source: 'scan' });
  const provider = opts.provider === undefined ? fakeProvider() : opts.provider;
  const native = createFakePdfNative();
  let clock = 1_000_000;
  let dbBroken = false;
  const store = createFilesStore({
    getDb: () => {
      if (dbBroken) throw new Error('disk I/O error');
      return db;
    },
    getProvider: () => provider,
    native,
    thumbWidth: 144,
    now: () => clock,
    thumbFlushMs: opts.thumbFlushMs,
  });
  return {
    db,
    provider,
    native,
    store,
    tick: (ms: number) => {
      clock += ms;
    },
    breakDb: () => {
      dbBroken = true;
    },
  };
}

const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort();
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('filesStore', () => {
  it('loadFromCache shows the cached rows synchronously, before any provider call', () => {
    const { store, provider } = setup({ seed: [info('A/a.pdf'), info('A/b.pdf')] });
    expect(store.getState().files).toHaveLength(0);
    store.getState().loadFromCache();
    expect(store.getState().files).toHaveLength(2);
    expect(store.getState().status).toBe('idle');
    expect(provider?.fullScan).not.toHaveBeenCalled();
  });

  it('refresh(full) reports scanning + progress, then idle with the scanned files; single-flight', async () => {
    let finish: (r: ScanResult) => void = () => {};
    const provider = fakeProvider({
      fullScan: jest.fn((onProgress) => {
        onProgress?.({ scannedFolders: 3, found: 1 });
        return new Promise<ScanResult>((res) => {
          finish = res;
        });
      }),
    });
    const { store } = setup({ provider });
    const first = store.getState().refresh('full');
    const second = store.getState().refresh('full');
    expect(store.getState().status).toBe('scanning');
    await flush();
    expect(store.getState().progress).toEqual({ scannedFolders: 3, found: 1 });
    finish(result([info('A/a.pdf'), info('B/b.pdf')]));
    await Promise.all([first, second]);
    expect(provider.fullScan).toHaveBeenCalledTimes(1);
    expect(store.getState().status).toBe('idle');
    expect(store.getState().progress).toBeNull();
    expect(names(store.getState().files)).toEqual(['a.pdf', 'b.pdf']);
    expect(store.getState().lastScanAt).toBe(1_000_000);
  });

  it('refresh is a no-op without a provider', async () => {
    const { store } = setup({ provider: null, seed: [info('A/a.pdf')] });
    store.getState().loadFromCache();
    await store.getState().refresh('full');
    expect(store.getState().files).toHaveLength(1);
    expect(store.getState().status).toBe('idle');
    expect(store.getState().lastScanAt).toBeNull();
  });

  it('a rejected full scan keeps the old list and returns to idle', async () => {
    const provider = fakeProvider({
      fullScan: jest.fn().mockRejectedValue(nativeError('ERR_PERMISSION_DENIED')),
    });
    const { store } = setup({ provider, seed: [info('A/a.pdf'), info('A/b.pdf')] });
    store.getState().loadFromCache();
    await expect(store.getState().refresh('full')).resolves.toBeUndefined();
    expect(names(store.getState().files)).toEqual(['a.pdf', 'b.pdf']);
    expect(store.getState().status).toBe('idle');
  });

  it('refresh(quick) applies folder changes: a new WhatsApp file appears (F-04)', async () => {
    const wa = 'Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents';
    const provider = fakeProvider({
      quickScan: jest.fn().mockResolvedValue({
        kind: 'folders',
        changes: [
          {
            uri: `${ROOT}/${wa}`,
            exists: true,
            modifiedAt: 2000,
            files: [info(`${wa}/old.pdf`), info(`${wa}/new.pdf`)],
          },
        ],
      }),
    });
    const { store } = setup({ provider, seed: [info(`${wa}/old.pdf`)] });
    store.getState().loadFromCache();
    await store.getState().refresh('quick');
    expect(provider.quickScan).toHaveBeenCalledWith([{ uri: `${ROOT}/${wa}`, modifiedAt: 1000 }]);
    expect(names(store.getState().files)).toEqual(['new.pdf', 'old.pdf']);
  });

  it('refresh(quick) falling back to a full result applies it', async () => {
    const provider = fakeProvider({
      quickScan: jest.fn().mockResolvedValue({ kind: 'full', result: result([info('C/c.pdf')]) }),
    });
    const { store } = setup({ provider, seed: [info('A/a.pdf')] });
    await store.getState().refresh('quick');
    expect(names(store.getState().files)).toEqual(['c.pdf']);
  });

  it('a full-access full refresh drops saf rows but keeps output rows', async () => {
    const provider = fakeProvider({ fullScan: jest.fn().mockResolvedValue(result([])) });
    const { store, db } = setup({ provider });
    const safUri = 'content://com.android.externalstorage.documents/tree/x/document/x%2Fs.pdf';
    upsertFile(db, { ...info('S/s.pdf'), uri: safUri }, 'saf');
    upsertFile(db, info('PDF Toolkit/out.pdf'), 'output');
    await store.getState().refresh('full');
    expect(names(store.getState().files)).toEqual(['out.pdf']);
  });

  it('a saf full refresh drops scan rows', async () => {
    const provider = fakeProvider({ mode: 'saf', source: 'saf' });
    const { store } = setup({ provider, seed: [info('A/a.pdf')] });
    await store.getState().refresh('full');
    expect(store.getState().files).toEqual([]);
  });

  it('toggleFavorite and markOpened update state and DB', () => {
    const { store, db, tick } = setup({ seed: [info('A/a.pdf')] });
    store.getState().loadFromCache();
    const id = idOf('A/a.pdf');
    store.getState().toggleFavorite(id);
    tick(5);
    store.getState().markOpened(id);
    expect(store.getState().files[0]).toMatchObject({ isFavorite: true, lastOpenedAt: 1_000_005 });
    expect(db.select().from(files).where(eq(files.id, id)).get()).toMatchObject({
      isFavorite: true,
      lastOpenedAt: 1_000_005,
    });
    store.getState().toggleFavorite(id);
    expect(store.getState().files[0]?.isFavorite).toBe(false);
  });

  it('remove calls the provider with uri+parentUri and the row is gone on resolve', async () => {
    const { store, provider } = setup({ seed: [info('A/a.pdf'), info('A/b.pdf')] });
    store.getState().loadFromCache();
    await expect(store.getState().remove(idOf('A/a.pdf'))).resolves.toBeNull();
    expect(provider?.remove).toHaveBeenCalledWith({
      uri: `${ROOT}/A/a.pdf`,
      parentUri: `${ROOT}/A`,
    });
    expect(names(store.getState().files)).toEqual(['b.pdf']);
  });

  it('rename keeps isFavorite and swaps the row', async () => {
    const provider = fakeProvider({
      rename: jest.fn().mockResolvedValue(info('A/renamed.pdf', { parentUri: '', folder: '' })),
    });
    const { store, db } = setup({ provider, seed: [info('A/a.pdf')] });
    setFavorite(db, idOf('A/a.pdf'), true);
    store.getState().loadFromCache();
    // The caller gets the row's new id (ids come from uris).
    await expect(store.getState().rename(idOf('A/a.pdf'), 'renamed.pdf')).resolves.toEqual({
      error: null,
      id: idOf('A/renamed.pdf'),
    });
    expect(provider.rename).toHaveBeenCalledWith(
      { uri: `${ROOT}/A/a.pdf`, parentUri: `${ROOT}/A` },
      'renamed.pdf',
    );
    expect(store.getState().files).toHaveLength(1);
    expect(store.getState().files[0]).toMatchObject({
      id: idOf('A/renamed.pdf'),
      name: 'renamed.pdf',
      isFavorite: true,
      parentUri: `${ROOT}/A`,
      folder: 'A',
    });
  });

  it('rename rejecting ERR_FILE_EXISTS returns exists and leaves the row unchanged', async () => {
    const provider = fakeProvider({
      rename: jest.fn().mockRejectedValue(nativeError('ERR_FILE_EXISTS')),
    });
    const { store } = setup({ provider, seed: [info('A/a.pdf')] });
    store.getState().loadFromCache();
    const before = store.getState().files;
    await expect(store.getState().rename(idOf('A/a.pdf'), 'b.pdf')).resolves.toEqual({
      error: 'exists',
      id: idOf('A/a.pdf'),
    });
    expect(store.getState().files).toEqual(before);
    // No session-wide id mapping: nothing can redirect a later open of this id.
    expect('renames' in store.getState()).toBe(false);
  });

  it.each([
    ['ERR_INVALID_NAME', 'invalidName'],
    ['ERR_PERMISSION_DENIED', 'permission'],
    ['ERR_IO', 'unknown'],
  ] as const)('maps %s to %s', async (code, expected) => {
    const provider = fakeProvider({ rename: jest.fn().mockRejectedValue(nativeError(code)) });
    const { store } = setup({ provider, seed: [info('A/a.pdf')] });
    store.getState().loadFromCache();
    await expect(store.getState().rename(idOf('A/a.pdf'), 'x.pdf')).resolves.toMatchObject({
      error: expected,
    });
    expect(store.getState().files).toHaveLength(1);
  });

  it('duplicate registers the copy with the provider source', async () => {
    const provider = fakeProvider({
      duplicate: jest.fn().mockResolvedValue(info('A/a (1).pdf')),
    });
    const { store } = setup({ provider, seed: [info('A/a.pdf')] });
    store.getState().loadFromCache();
    await expect(store.getState().duplicate(idOf('A/a.pdf'))).resolves.toBeNull();
    expect(store.getState().files.find((f) => f.name === 'a (1).pdf')?.source).toBe('scan');
    expect(store.getState().files).toHaveLength(2);
  });

  it('duplicate rejecting ERR_FILE_NOT_FOUND returns notFound and removes the row', async () => {
    const provider = fakeProvider({
      duplicate: jest.fn().mockRejectedValue(nativeError('ERR_FILE_NOT_FOUND')),
    });
    const { store, db } = setup({ provider, seed: [info('A/a.pdf'), info('A/b.pdf')] });
    store.getState().loadFromCache();
    await expect(store.getState().duplicate(idOf('A/a.pdf'))).resolves.toBe('notFound');
    expect(names(store.getState().files)).toEqual(['b.pdf']);
    expect(listFiles(db)).toHaveLength(1);
  });

  it('moveToAppFolder in SAF mode registers the moved file as output', async () => {
    const provider = fakeProvider({
      mode: 'saf',
      source: 'saf',
      moveToAppFolder: jest.fn().mockResolvedValue(info('Documents/PDF Toolkit/a.pdf')),
    });
    const { store, db } = setup({ provider });
    upsertFile(db, info('A/a.pdf'), 'saf');
    store.getState().loadFromCache();
    await expect(store.getState().moveToAppFolder(idOf('A/a.pdf'))).resolves.toEqual({
      error: null,
      id: idOf('Documents/PDF Toolkit/a.pdf'),
    });
    expect(store.getState().files).toHaveLength(1);
    expect(store.getState().files[0]).toMatchObject({
      id: idOf('Documents/PDF Toolkit/a.pdf'),
      source: 'output',
    });
  });

  it('moveToAppFolder in full mode keeps the scan source', async () => {
    const provider = fakeProvider({
      moveToAppFolder: jest.fn().mockResolvedValue(info('Documents/PDF Toolkit/a.pdf')),
    });
    const { store } = setup({ provider, seed: [info('A/a.pdf')] });
    store.getState().loadFromCache();
    await store.getState().moveToAppFolder(idOf('A/a.pdf'));
    expect(store.getState().files[0]?.source).toBe('scan');
  });

  it('file actions without a provider or row fail without throwing', async () => {
    const { store } = setup({ provider: null, seed: [info('A/a.pdf')] });
    store.getState().loadFromCache();
    await expect(store.getState().remove(idOf('A/a.pdf'))).resolves.toBe('permission');
    const other = setup();
    await expect(other.store.getState().remove('nope')).resolves.toBe('notFound');
  });

  it('requestThumb success updates thumbPath and pageCount in state and DB', async () => {
    const { store, db, native } = setup({ seed: [info('A/a.pdf')] });
    native.getPageCount.mockResolvedValue(7);
    native.generateThumbnail.mockResolvedValue('file:///cache/t.jpg');
    store.getState().loadFromCache();
    store.getState().requestThumb(store.getState().files[0]!);
    await flush();
    expect(native.generateThumbnail).toHaveBeenCalledWith(`${ROOT}/A/a.pdf`, 1, 144);
    expect(store.getState().files[0]).toMatchObject({
      thumbPath: 'file:///cache/t.jpg',
      pageCount: 7,
    });
    expect(
      db
        .select()
        .from(files)
        .where(eq(files.id, idOf('A/a.pdf')))
        .get(),
    ).toMatchObject({
      thumbPath: 'file:///cache/t.jpg',
      pageCount: 7,
    });
  });

  it('requestThumb for a vanished file removes the row and sets notice notFound', async () => {
    const { store, db, native } = setup({ seed: [info('A/a.pdf'), info('A/b.pdf')] });
    native.getPageCount.mockRejectedValue(nativeError('ERR_FILE_NOT_FOUND'));
    native.generateThumbnail.mockRejectedValue(nativeError('ERR_FILE_NOT_FOUND'));
    store.getState().loadFromCache();
    const a = store.getState().files.find((f) => f.name === 'a.pdf')!;
    store.getState().requestThumb(a);
    await flush();
    expect(names(store.getState().files)).toEqual(['b.pdf']);
    expect(listFiles(db)).toHaveLength(1);
    expect(store.getState().notice).toBe('notFound');
    store.getState().clearNotice();
    expect(store.getState().notice).toBeNull();
  });

  it('requestThumb persists a corrupt result and never requests it again', async () => {
    const { store, db, native } = setup({ seed: [info('A/a.pdf')] });
    native.getPageCount.mockRejectedValue(nativeError('ERR_PDF_INVALID'));
    store.getState().loadFromCache();
    store.getState().requestThumb(store.getState().files[0]!);
    await flush();
    expect(store.getState().files[0]?.isCorrupt).toBe(true);
    expect(db.select().from(files).get()?.isCorrupt).toBe(true);

    const fresh = setup({ seed: [info('A/b.pdf')] });
    const corrupt = { ...fresh.store.getState().files[0], ...listFiles(fresh.db)[0]! };
    fresh.store.getState().requestThumb({ ...corrupt, isCorrupt: true });
    fresh.store.getState().requestThumb({ ...corrupt, isEncrypted: true });
    fresh.store.getState().requestThumb({ ...corrupt, thumbPath: 'file:///t.jpg' });
    await flush();
    expect(fresh.native.getPageCount).not.toHaveBeenCalled();
  });

  it('requestThumb records encrypted files', async () => {
    const { store, native } = setup({ seed: [info('A/a.pdf')] });
    native.getPageCount.mockRejectedValue(nativeError('ERR_PDF_ENCRYPTED'));
    store.getState().loadFromCache();
    store.getState().requestThumb(store.getState().files[0]!);
    await flush();
    expect(store.getState().files[0]).toMatchObject({ isEncrypted: true, thumbPath: null });
  });
});

function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('filesStore: index writers are serialized', () => {
  it('a rename during a full scan survives the stale scan result (favourite, lastPage, bookmarks)', async () => {
    const scanDone = deferred<ScanResult>();
    const provider = fakeProvider({
      fullScan: jest.fn(() => scanDone.promise),
      rename: jest.fn().mockResolvedValue(info('A/b.pdf')),
    });
    const { store, db } = setup({ provider, seed: [info('A/a.pdf')] });
    const a = idOf('A/a.pdf');
    setFavorite(db, a, true);
    db.update(files).set({ lastPage: 4 }).where(eq(files.id, a)).run();
    db.insert(bookmarks).values({ fileId: a, page: 2, createdAt: 1 }).run();
    store.getState().loadFromCache();

    const scan = store.getState().refresh('full');
    await flush();
    const renamed = store.getState().rename(a, 'b.pdf');
    await flush();
    expect(provider.rename).not.toHaveBeenCalled();
    // The scan listed the folder before the rename happened.
    scanDone.resolve(result([info('A/a.pdf')]));
    await scan;
    await expect(renamed).resolves.toEqual({ error: null, id: idOf('A/b.pdf') });

    const b = idOf('A/b.pdf');
    expect(names(listFiles(db))).toEqual(['b.pdf']);
    expect(names(store.getState().files)).toEqual(['b.pdf']);
    expect(db.select().from(files).where(eq(files.id, b)).get()).toMatchObject({
      isFavorite: true,
      lastPage: 4,
    });
    expect(db.select().from(bookmarks).where(eq(bookmarks.fileId, b)).all()).toHaveLength(1);
  });

  it('a scan requested while an action runs waits for it', async () => {
    const removed = deferred<void>();
    const provider = fakeProvider({ remove: jest.fn(() => removed.promise) });
    const { store } = setup({ provider, seed: [info('A/a.pdf')] });
    store.getState().loadFromCache();
    const action = store.getState().remove(idOf('A/a.pdf'));
    await flush();
    const scan = store.getState().refresh('full');
    await flush();
    expect(provider.fullScan).not.toHaveBeenCalled();
    removed.resolve();
    await Promise.all([action, scan]);
    expect(provider.fullScan).toHaveBeenCalledTimes(1);
  });
});

describe('filesStore: refresh chaining', () => {
  it('a full requested during a quick runs once after it; several fulls coalesce', async () => {
    const quickDone = deferred<{ kind: 'folders'; changes: [] }>();
    const provider = fakeProvider({ quickScan: jest.fn(() => quickDone.promise) });
    const { store } = setup({ provider });
    const quick = store.getState().refresh('quick');
    await flush();
    const full1 = store.getState().refresh('full');
    const full2 = store.getState().refresh('full');
    const quick2 = store.getState().refresh('quick');
    expect(full2).toBe(full1);
    expect(provider.fullScan).not.toHaveBeenCalled();
    quickDone.resolve({ kind: 'folders', changes: [] });
    await Promise.all([quick, full1, full2, quick2]);
    expect(provider.quickScan).toHaveBeenCalledTimes(1);
    expect(provider.fullScan).toHaveBeenCalledTimes(1);
    expect(store.getState().status).toBe('idle');
  });

  it('a quick requested during a full returns the full promise', async () => {
    const fullDone = deferred<ScanResult>();
    const provider = fakeProvider({ fullScan: jest.fn(() => fullDone.promise) });
    const { store } = setup({ provider });
    const full = store.getState().refresh('full');
    const quick = store.getState().refresh('quick');
    expect(quick).toBe(full);
    fullDone.resolve(result([]));
    await quick;
    expect(provider.quickScan).not.toHaveBeenCalled();
  });
});

describe('filesStore: content-keyed thumbnails', () => {
  it('regenerates a thumbnail after a rescan reset it for changed content', async () => {
    const provider = fakeProvider({
      fullScan: jest.fn().mockResolvedValue(result([info('A/a.pdf', { sizeBytes: 999 })])),
    });
    const { store, native } = setup({ provider, seed: [info('A/a.pdf')] });
    store.getState().loadFromCache();
    store.getState().requestThumb(store.getState().files[0]!);
    await flush();
    expect(store.getState().files[0]?.thumbPath).toBe('file:///thumb.jpg');
    await store.getState().refresh('full');
    expect(store.getState().files[0]?.thumbPath).toBeNull();
    store.getState().requestThumb(store.getState().files[0]!);
    await flush();
    expect(native.generateThumbnail).toHaveBeenCalledTimes(2);
    expect(store.getState().files[0]?.thumbPath).toBe('file:///thumb.jpg');
  });

  it('ignores a thumbnail result for content that changed while it was generated', async () => {
    const thumbDone = deferred<string>();
    const provider = fakeProvider({
      fullScan: jest.fn().mockResolvedValue(result([info('A/a.pdf', { modifiedAt: 7777 })])),
    });
    const { store, db, native } = setup({ provider, seed: [info('A/a.pdf')] });
    native.generateThumbnail.mockReturnValueOnce(thumbDone.promise);
    store.getState().loadFromCache();
    store.getState().requestThumb(store.getState().files[0]!);
    await flush();
    await store.getState().refresh('full');
    thumbDone.resolve('file:///stale.jpg');
    await flush();
    expect(store.getState().files[0]).toMatchObject({ thumbPath: null, pageCount: null });
    expect(db.select().from(files).get()).toMatchObject({ thumbPath: null, pageCount: null });
  });
});

describe('filesStore: render-friendly updates', () => {
  it('a full rescan that changes nothing keeps the same files array (no list re-render)', async () => {
    const provider = fakeProvider({
      fullScan: jest.fn().mockResolvedValue(result([info('A/a.pdf'), info('A/b.pdf')])),
    });
    const { store } = setup({ provider, seed: [info('A/a.pdf'), info('A/b.pdf')] });
    store.getState().loadFromCache();
    const before = store.getState().files;
    await store.getState().refresh('full');
    expect(store.getState().files).toBe(before);
    expect(store.getState().lastScanAt).not.toBeNull();
  });

  it('a quick rescan with no folder changes keeps the same files array', async () => {
    const { store } = setup({ seed: [info('A/a.pdf')] });
    store.getState().loadFromCache();
    const before = store.getState().files;
    await store.getState().refresh('quick');
    expect(store.getState().files).toBe(before);
  });

  it('a no-change scan still lists the DB when the cache was never loaded', async () => {
    const provider = fakeProvider({
      fullScan: jest.fn().mockResolvedValue(result([info('A/a.pdf')])),
    });
    const { store } = setup({ provider, seed: [info('A/a.pdf')] });
    await store.getState().refresh('full');
    expect(names(store.getState().files)).toEqual(['a.pdf']);
  });

  it('batches thumbnail results into one store update and one DB write per flush', async () => {
    const seed = [info('A/a.pdf'), info('A/b.pdf'), info('A/c.pdf'), info('A/d.pdf')];
    const { store, db, native } = setup({ seed, thumbFlushMs: 30 });
    native.generateThumbnail.mockImplementation((uri: string) =>
      Promise.resolve(`file:///thumbs/${uri.slice(uri.lastIndexOf('/') + 1)}.jpg`),
    );
    native.getPageCount.mockRejectedValueOnce(nativeError('ERR_FILE_NOT_FOUND'));
    store.getState().loadFromCache();
    const updates: number[] = [];
    const unsub = store.subscribe((s, prev) => {
      if (s.files !== prev.files) updates.push(s.files.length);
    });
    for (const f of store.getState().files) store.getState().requestThumb(f);
    await flush();
    expect(updates).toEqual([]);
    await new Promise((r) => setTimeout(r, 60));
    unsub();
    expect(updates).toEqual([3]);
    expect(store.getState().notice).toBe('notFound');
    const thumbs = store
      .getState()
      .files.map((f) => f.thumbPath)
      .sort();
    expect(thumbs).toHaveLength(3);
    expect(thumbs.every((t) => t?.startsWith('file:///thumbs/'))).toBe(true);
    expect(listFiles(db).filter((r) => r.thumbPath)).toHaveLength(3);
    expect(listFiles(db)).toHaveLength(3);
  });
});

describe('filesStore: errors', () => {
  it('loadFromCache with an unavailable DB ends idle with error cache', () => {
    const store = createFilesStore({
      getDb: () => {
        throw new Error('disk I/O error');
      },
      getProvider: () => null,
      native: createFakePdfNative(),
      thumbWidth: 100,
      now: () => 0,
    });
    expect(store.getState().status).toBe('loading');
    expect(() => store.getState().loadFromCache()).not.toThrow();
    expect(store.getState()).toMatchObject({ status: 'idle', error: 'cache', files: [] });
  });

  it('a failed scan sets error scan; a later successful scan clears it', async () => {
    const provider = fakeProvider({
      fullScan: jest
        .fn()
        .mockRejectedValueOnce(nativeError('ERR_IO'))
        .mockResolvedValueOnce(result([])),
    });
    const { store } = setup({ provider });
    await store.getState().refresh('full');
    expect(store.getState()).toMatchObject({ status: 'idle', error: 'scan' });
    await store.getState().refresh('full');
    expect(store.getState().error).toBeNull();
  });

  it('reportError ends loading and exposes the code', () => {
    const { store } = setup();
    store.getState().reportError('scan');
    expect(store.getState()).toMatchObject({ status: 'idle', error: 'scan' });
  });
});

describe('filesStore: final review fixes', () => {
  it('regenerates a thumbnail whose cached file is gone, at most once per row per session (F1)', async () => {
    const { store, db, native } = setup({ seed: [info('A/a.pdf')] });
    const id = idOf('A/a.pdf');
    store.getState().loadFromCache();
    store.getState().requestThumb(store.getState().files[0]!);
    await flush();
    expect(native.generateThumbnail).toHaveBeenCalledTimes(1);

    // The OS trimmed the cache: the Image cannot load the stored thumbPath.
    store.getState().thumbMissing(id);
    expect(getFile(db, id)?.thumbPath).toBeNull();
    await flush();
    expect(native.generateThumbnail).toHaveBeenCalledTimes(2);
    expect(store.getState().files[0]?.thumbPath).toBe('file:///thumb.jpg');

    // Still unloadable: no loop. The row falls back to the placeholder icon.
    store.getState().thumbMissing(id);
    await flush();
    store.getState().requestThumb(store.getState().files[0]!);
    await flush();
    expect(native.generateThumbnail).toHaveBeenCalledTimes(2);
    expect(store.getState().files[0]?.thumbPath).toBeNull();
  });

  it('SAF move then a SAF scan that sees the moved file leaves exactly one row, favourite kept (F2)', async () => {
    const TREE = 'content://com.android.externalstorage.documents/tree/primary%3ADocuments';
    const moved: PdfFileInfo = {
      uri: 'content://media/external/file/42',
      name: 'a.pdf',
      folder: 'Documents/PDFToolkit',
      parentUri: `${ROOT}/Documents/PDFToolkit`,
      parentModifiedAt: 0,
      sizeBytes: 100,
      modifiedAt: 5000,
    };
    const scanned: PdfFileInfo = {
      ...moved,
      uri: `${TREE}/document/primary%3ADocuments%2FPDFToolkit%2Fa.pdf`,
      parentUri: `${TREE}/document/primary%3ADocuments%2FPDFToolkit`,
      modifiedAt: 5432,
    };
    const provider = fakeProvider({
      mode: 'saf',
      source: 'saf',
      moveToAppFolder: jest.fn().mockResolvedValue(moved),
      fullScan: jest
        .fn()
        .mockResolvedValue({ files: [scanned], scannedRoots: [TREE], failedRoots: [] }),
    });
    const { store, db } = setup({ provider });
    upsertFile(db, info('A/a.pdf'), 'saf');
    setFavorite(db, idOf('A/a.pdf'), true);
    store.getState().loadFromCache();
    await expect(store.getState().moveToAppFolder(idOf('A/a.pdf'))).resolves.toMatchObject({
      error: null,
    });
    await store.getState().refresh('full');
    expect(store.getState().files).toHaveLength(1);
    expect(store.getState().files[0]).toMatchObject({
      uri: scanned.uri,
      source: 'output',
      isFavorite: true,
    });
    expect(listFiles(db)).toHaveLength(1);
  });

  it('a thumbnail on an unavailable volume (SD card removed) keeps the row and sets no notice (F3)', async () => {
    const { store, db, native } = setup({ seed: [info('A/a.pdf')] });
    native.getPageCount.mockRejectedValue(nativeError('ERR_VOLUME_UNAVAILABLE'));
    setFavorite(db, idOf('A/a.pdf'), true);
    store.getState().loadFromCache();
    store.getState().requestThumb(store.getState().files[0]!);
    await flush();
    expect(store.getState().files).toHaveLength(1);
    expect(store.getState().notice).toBeNull();
    expect(getFile(db, idOf('A/a.pdf'))).toMatchObject({ isFavorite: true, isCorrupt: false });
  });

  it('a file action on an unavailable volume keeps the row and reports unavailable (F3)', async () => {
    const provider = fakeProvider({
      remove: jest.fn().mockRejectedValue(nativeError('ERR_VOLUME_UNAVAILABLE')),
    });
    const { store, db } = setup({ provider, seed: [info('A/a.pdf')] });
    setFavorite(db, idOf('A/a.pdf'), true);
    store.getState().loadFromCache();
    await expect(store.getState().remove(idOf('A/a.pdf'))).resolves.toBe('unavailable');
    expect(store.getState().files).toHaveLength(1);
    expect(getFile(db, idOf('A/a.pdf'))?.isFavorite).toBe(true);
  });

  it('toggleFavorite and markOpened never throw on a DB error and show a notice (F4)', () => {
    const { store, breakDb } = setup({ seed: [info('A/a.pdf')] });
    store.getState().loadFromCache();
    const id = idOf('A/a.pdf');
    breakDb();
    expect(() => store.getState().toggleFavorite(id)).not.toThrow();
    expect(store.getState().files[0]?.isFavorite).toBe(false);
    expect(store.getState().notice).toBe('unknown');
    store.getState().clearNotice();
    expect(() => store.getState().markOpened(id)).not.toThrow();
    expect(store.getState().files[0]?.lastOpenedAt).toBeNull();
    expect(store.getState().notice).toBe('unknown');
  });
});

describe('filesStore: reader actions', () => {
  const WA = 'content://com.whatsapp.provider/x/1';
  const content = (uri = WA): PdfFileInfo => ({
    uri,
    name: 'invoice.pdf',
    folder: '',
    parentUri: '',
    parentModifiedAt: 0,
    sizeBytes: 10,
    modifiedAt: 20,
  });

  it('setLastPage updates the state row and the DB', () => {
    const { store, db } = setup({ seed: [info('A/a.pdf')] });
    store.getState().loadFromCache();
    store.getState().setLastPage(idOf('A/a.pdf'), 12);
    expect(store.getState().files[0]?.lastPage).toBe(12);
    expect(getFile(db, idOf('A/a.pdf'))?.lastPage).toBe(12);
  });

  it('setLastPage does not throw when the DB fails', () => {
    const { store, breakDb } = setup({ seed: [info('A/a.pdf')] });
    store.getState().loadFromCache();
    breakDb();
    expect(() => store.getState().setLastPage(idOf('A/a.pdf'), 3)).not.toThrow();
    expect(store.getState().files[0]?.lastPage).not.toBe(3);
  });

  it('getRow reads state, then the DB, else null', () => {
    const { store } = setup({ seed: [info('A/a.pdf')] });
    expect(store.getState().files).toEqual([]);
    expect(store.getState().getRow(idOf('A/a.pdf'))?.name).toBe('a.pdf');
    expect(store.getState().getRow('nope')).toBeNull();
  });

  it('dropMissing removes the row, sets the notice and keeps others', () => {
    const { store, db } = setup({ seed: [info('A/a.pdf'), info('A/b.pdf')] });
    store.getState().loadFromCache();
    store.getState().dropMissing(idOf('A/a.pdf'));
    expect(store.getState().files.map((f) => f.name)).toEqual(['b.pdf']);
    expect(getFile(db, idOf('A/a.pdf'))).toBeUndefined();
    expect(store.getState().notice).toBe('notFound');
  });

  it('dropMissing releases the grant only for intent rows', () => {
    const { store, native } = setup({ seed: [info('A/a.pdf')] });
    store.getState().loadFromCache();
    const row = store.getState().registerIncoming(content());
    store.getState().dropMissing(idOf('A/a.pdf'));
    expect(native.releaseIncomingGrant).not.toHaveBeenCalled();
    store.getState().dropMissing(row!.id);
    expect(native.releaseIncomingGrant).toHaveBeenCalledWith(WA);
  });

  it('release failures are ignored', () => {
    const { store, native } = setup();
    native.releaseIncomingGrant.mockRejectedValue(new Error('x'));
    const row = store.getState().registerIncoming(content());
    expect(() => store.getState().dropMissing(row!.id)).not.toThrow();
  });

  it('remove of an intent row releases its grant', async () => {
    const { store, native } = setup();
    const row = store.getState().registerIncoming(content());
    expect(await store.getState().remove(row!.id)).toBeNull();
    expect(native.releaseIncomingGrant).toHaveBeenCalledWith(WA);
  });

  it('registerIncoming inserts an intent row, marks it opened, and is idempotent', () => {
    const { store } = setup();
    const row = store.getState().registerIncoming(content());
    expect(row).toMatchObject({
      id: fileIdForUri(WA),
      source: 'intent',
      lastOpenedAt: 1_000_000,
      folder: '',
    });
    store.getState().registerIncoming(content());
    expect(store.getState().files).toHaveLength(1);
    expect(store.getState().files[0]?.source).toBe('intent');
  });

  it('registerIncoming keeps an existing scan row and its source', () => {
    const { store } = setup({ seed: [info('A/a.pdf')] });
    const row = store.getState().registerIncoming(info('A/a.pdf'));
    expect(row?.source).toBe('scan');
    expect(row?.lastOpenedAt).toBe(1_000_000);
    expect(store.getState().files).toHaveLength(1);
  });

  it('registerIncoming returns null when the DB fails', () => {
    const { store, breakDb } = setup();
    breakDb();
    expect(store.getState().registerIncoming(content())).toBeNull();
  });

  describe('tool outputs and picked documents', () => {
    it('registerOutputs indexes rows as output and lists them', async () => {
      const { store, db } = setup();
      const rows = await store
        .getState()
        .registerOutputs([info('Documents/PDFToolkit/a merged.pdf')]);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.source).toBe('output');
      expect(store.getState().files.map((f) => f.id)).toEqual([rows[0]?.id]);
      expect(getFile(db, idOf('Documents/PDFToolkit/a merged.pdf'))?.source).toBe('output');
    });

    it('registerOutputs waits for an in-flight scan and survives its applyScan', async () => {
      let finish: (r: ScanResult) => void = () => {};
      const provider = fakeProvider({
        fullScan: jest.fn(
          () =>
            new Promise<ScanResult>((res) => {
              finish = res;
            }),
        ),
      });
      const { store, db } = setup({ provider });
      const scanning = store.getState().refresh('full');
      let registered = false;
      const reg = store
        .getState()
        .registerOutputs([info('Documents/PDFToolkit/out.pdf')])
        .then((r) => {
          registered = true;
          return r;
        });
      await flush();
      expect(registered).toBe(false);
      expect(getFile(db, idOf('Documents/PDFToolkit/out.pdf'))).toBeUndefined();
      finish(result([info('A/a.pdf')]));
      await scanning;
      const rows = await reg;
      expect(registered).toBe(true);
      expect(rows[0]?.source).toBe('output');
      expect(names(store.getState().files)).toEqual(['a.pdf', 'out.pdf']);
      expect(getFile(db, idOf('Documents/PDFToolkit/out.pdf'))?.source).toBe('output');
    });

    it('registerOutputs promotes a scan row to output and a later scan keeps it', async () => {
      const a = info('Documents/PDFToolkit/a.pdf');
      const provider = fakeProvider({ fullScan: jest.fn().mockResolvedValue(result([a])) });
      const { store, db } = setup({ seed: [a], provider });
      expect(getFile(db, idOf('Documents/PDFToolkit/a.pdf'))?.source).toBe('scan');
      const rows = await store.getState().registerOutputs([a]);
      expect(rows[0]?.source).toBe('output');
      await store.getState().refresh('full');
      expect(getFile(db, idOf('Documents/PDFToolkit/a.pdf'))?.source).toBe('output');
    });

    it('registerOutputs returns rows in output order', async () => {
      const { store } = setup();
      const rows = await store
        .getState()
        .registerOutputs([info('O/z.pdf'), info('O/a.pdf'), info('O/m.pdf')]);
      expect(rows.map((r) => r.name)).toEqual(['z.pdf', 'a.pdf', 'm.pdf']);
    });

    it('registerOutputs returns [] when the DB fails', async () => {
      const { store, breakDb } = setup();
      breakDb();
      expect(await store.getState().registerOutputs([info('A/o.pdf')])).toEqual([]);
    });

    it('addPickedDocuments indexes intent rows, counts failures, never throws', async () => {
      const { store, native } = setup();
      native.resolveIncomingPdf.mockImplementation((uri: string) =>
        uri.endsWith('/2')
          ? Promise.reject(nativeError('ERR_PERMISSION_DENIED'))
          : Promise.resolve({
              uri,
              name: 'p.pdf',
              folder: '',
              parentUri: 'content://p',
              parentModifiedAt: 0,
              sizeBytes: 1,
              modifiedAt: 1,
            }),
      );
      const out = await store.getState().addPickedDocuments(['content://p/1', 'content://p/2']);
      expect(out.failed).toBe(1);
      expect(out.rows).toHaveLength(1);
      expect(out.rows[0]).toMatchObject({ source: 'intent', folder: '', lastOpenedAt: null });
      expect(store.getState().files).toHaveLength(1);
    });

    it('addPickedDocuments reuses an existing row unchanged', async () => {
      const { store, native } = setup({ seed: [info('A/a.pdf')] });
      const uri = `${ROOT}/A/a.pdf`;
      store.getState().loadFromCache();
      native.resolveIncomingPdf.mockResolvedValue(info('A/a.pdf', { sizeBytes: 999 }));
      const out = await store.getState().addPickedDocuments([uri]);
      expect(out.rows[0]).toMatchObject({ source: 'scan', sizeBytes: 100 });
      expect(native.resolveIncomingPdf).toHaveBeenCalledTimes(1);
    });

    it('getRows preserves order and skips missing ids', () => {
      const { store } = setup({ seed: [info('A/a.pdf'), info('A/b.pdf')] });
      store.getState().loadFromCache();
      const a = idOf('A/a.pdf');
      const b = idOf('A/b.pdf');
      expect(
        store
          .getState()
          .getRows([b, 'nope', a])
          .map((r) => r.id),
      ).toEqual([b, a]);
    });
  });
});

describe('filesStore: resetThumbnails', () => {
  it('nulls every thumbPath in state and DB and queues the rows again, retried ones too', async () => {
    const { store, db, native } = setup({ seed: [info('A/a.pdf'), info('A/b.pdf')] });
    store.getState().loadFromCache();
    for (const f of store.getState().files) store.getState().requestThumb(f);
    await flush();
    expect(native.generateThumbnail).toHaveBeenCalledTimes(2);
    const id = idOf('A/a.pdf');
    store.getState().thumbMissing(id); // already retried this session
    await flush();
    expect(native.generateThumbnail).toHaveBeenCalledTimes(3);

    store.getState().resetThumbnails();
    expect(store.getState().files.every((f) => f.thumbPath === null)).toBe(true);
    expect(getFile(db, id)?.thumbPath).toBeNull();
    await flush();
    expect(native.generateThumbnail).toHaveBeenCalledTimes(5);
    expect(store.getState().files.every((f) => f.thumbPath === 'file:///thumb.jpg')).toBe(true);

    // The retry-once guard is cleared as well.
    store.getState().thumbMissing(id);
    await flush();
    expect(native.generateThumbnail).toHaveBeenCalledTimes(6);
  });
});
