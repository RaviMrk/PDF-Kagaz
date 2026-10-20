import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { bookmarks, files } from '@/db/schema';
import {
  applyScan,
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

function setup(opts: { provider?: StorageProvider | null; seed?: PdfFileInfo[] } = {}) {
  const db = makeDb();
  if (opts.seed) applyScan(db, { result: result(opts.seed), source: 'scan' });
  const provider = opts.provider === undefined ? fakeProvider() : opts.provider;
  const native = createFakePdfNative();
  let clock = 1_000_000;
  const store = createFilesStore({
    getDb: () => db,
    getProvider: () => provider,
    native,
    thumbWidth: 144,
    now: () => clock,
  });
  return {
    db,
    provider,
    native,
    store,
    tick: (ms: number) => {
      clock += ms;
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
    await expect(store.getState().rename(idOf('A/a.pdf'), 'renamed.pdf')).resolves.toBeNull();
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
    await expect(store.getState().rename(idOf('A/a.pdf'), 'b.pdf')).resolves.toBe('exists');
    expect(store.getState().files).toEqual(before);
  });

  it.each([
    ['ERR_INVALID_NAME', 'invalidName'],
    ['ERR_PERMISSION_DENIED', 'permission'],
    ['ERR_IO', 'unknown'],
  ] as const)('maps %s to %s', async (code, expected) => {
    const provider = fakeProvider({ rename: jest.fn().mockRejectedValue(nativeError(code)) });
    const { store } = setup({ provider, seed: [info('A/a.pdf')] });
    store.getState().loadFromCache();
    await expect(store.getState().rename(idOf('A/a.pdf'), 'x.pdf')).resolves.toBe(expected);
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
    await expect(store.getState().moveToAppFolder(idOf('A/a.pdf'))).resolves.toBeNull();
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
    await expect(renamed).resolves.toBeNull();

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
