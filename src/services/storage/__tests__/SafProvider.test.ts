/**
 * @jest-environment node
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { applyScan, listFiles, listScanRoots } from '@/services/index/fileIndexRepo';
import { createFakePdfNative } from '@/test-utils/fakePdfNative';

import { createSafProvider } from '../SafProvider';

function makeDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = OFF');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  sqlite.pragma('foreign_keys = ON');
  return db;
}

const DOCS = 'content://t/tree/primary%3ADocuments';
const WORK = 'content://t/tree/primary%3AWork';

function setup() {
  const native = createFakePdfNative();
  const db = makeDb();
  const provider = createSafProvider({ native, getDb: () => db, now: () => 42 });
  return { native, db, provider };
}

describe('SafProvider', () => {
  it('addRoot stores a scan_roots row', async () => {
    const { native, db, provider } = setup();
    native.pickFolder.mockResolvedValue({ uri: DOCS, label: 'Documents' });
    await expect(provider.addRoot()).resolves.toEqual({
      uri: DOCS,
      label: 'Documents',
      granted: true,
    });
    expect(listScanRoots(db)).toEqual([{ uri: DOCS, label: 'Documents', addedAt: 42 }]);
  });

  it('addRoot returns null and stores nothing when the picker is cancelled', async () => {
    const { db, provider } = setup();
    await expect(provider.addRoot()).resolves.toBeNull();
    expect(listScanRoots(db)).toEqual([]);
    await expect(provider.requestAccess()).resolves.toBe(false);
  });

  it('scans only granted roots and reports the ungranted one as failed', async () => {
    const { native, provider } = setup();
    native.pickFolder.mockResolvedValueOnce({ uri: DOCS, label: 'Documents' });
    native.pickFolder.mockResolvedValueOnce({ uri: WORK, label: 'Work' });
    await provider.addRoot();
    await provider.addRoot();
    native.getPersistedFolderUris.mockResolvedValue([DOCS]);
    native.scanPdfs.mockResolvedValue({ files: [], scannedRoots: [DOCS], failedRoots: [] });

    const result = await provider.fullScan();
    expect(native.scanPdfs).toHaveBeenCalledWith([DOCS]);
    expect(result.failedRoots).toEqual([WORK]);
    await expect(provider.listRoots()).resolves.toEqual([
      { uri: DOCS, label: 'Documents', granted: true },
      { uri: WORK, label: 'Work', granted: false },
    ]);
    await expect(provider.hasAccess()).resolves.toBe(true);
    await expect(provider.quickScan([])).resolves.toMatchObject({ kind: 'full' });
  });

  it('never calls native scanPdfs with an empty list', async () => {
    const { native, provider } = setup();
    await expect(provider.fullScan()).resolves.toEqual({
      files: [],
      scannedRoots: [],
      failedRoots: [],
    });
    native.pickFolder.mockResolvedValue({ uri: WORK, label: 'Work' });
    await provider.addRoot();
    await expect(provider.fullScan()).resolves.toMatchObject({ failedRoots: [WORK] });
    expect(native.scanPdfs).not.toHaveBeenCalled();
    await expect(provider.hasAccess()).resolves.toBe(false);
  });

  it('removeRoot releases the folder and removes saf rows under it', async () => {
    const { native, db, provider } = setup();
    native.pickFolder.mockResolvedValue({ uri: DOCS, label: 'Documents' });
    await provider.addRoot();
    const file = `${DOCS}/document/primary%3ADocuments%2Fa.pdf`;
    applyScan(db, {
      source: 'saf',
      result: {
        scannedRoots: [DOCS],
        failedRoots: [],
        files: [
          {
            uri: file,
            name: 'a.pdf',
            folder: 'Documents',
            parentUri: DOCS,
            parentModifiedAt: 0,
            sizeBytes: 1,
            modifiedAt: 1,
          },
        ],
      },
    });
    expect(listFiles(db)).toHaveLength(1);
    await provider.removeRoot(DOCS);
    expect(native.releaseFolder).toHaveBeenCalledWith(DOCS);
    expect(listFiles(db)).toHaveLength(0);
    expect(listScanRoots(db)).toHaveLength(0);
  });
});
