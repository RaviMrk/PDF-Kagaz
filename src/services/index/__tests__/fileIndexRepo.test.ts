/**
 * @jest-environment node
 */
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { bookmarks, files } from '@/db/schema';
import type { FolderChange, PdfFileInfo, ScanResult } from '@/services/native/pdfNative';
import { fileIdForUri } from '@/utils/fileId';

import {
  addScanRoot,
  applyFolderChanges,
  applyScan,
  deleteBySource,
  getFolderStamps,
  isUnderRoot,
  listFiles,
  listScanRoots,
  markOpened,
  removeFile,
  removeScanRoot,
  replaceFile,
  setFavorite,
  updateThumb,
  upsertFile,
} from '../fileIndexRepo';

function makeDb() {
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

const scan = (
  fs: PdfFileInfo[],
  scannedRoots: string[] = [ROOT],
  failedRoots: string[] = [],
): { result: ScanResult; source: 'scan' } => ({
  result: { files: fs, scannedRoots, failedRoots },
  source: 'scan',
});

const idOf = (path: string) => fileIdForUri(`${ROOT}/${path}`);

describe('isUnderRoot', () => {
  it('matches on a path boundary', () => {
    expect(isUnderRoot('file:///s/0/Download/a.pdf', 'file:///s/0/Down')).toBe(false);
    expect(isUnderRoot('file:///s/0/Download/a.pdf', 'file:///s/0/Download')).toBe(true);
  });
});

describe('applyScan', () => {
  it('adds new files with source scan and parentUri', () => {
    const db = makeDb();
    const diff = applyScan(db, scan([info('A/a.pdf'), info('A/b.pdf'), info('B/c.pdf')]));
    expect(diff).toEqual({ added: 3, updated: 0, removed: 0 });
    const rows = listFiles(db);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.source === 'scan' && r.parentUri !== null)).toBe(true);
    expect(rows.find((r) => r.name === 'c.pdf')?.parentUri).toBe(`${ROOT}/B`);
  });

  it('keeps favourite on change but resets thumb data; untouched when unchanged', () => {
    const db = makeDb();
    applyScan(db, scan([info('A/a.pdf')]));
    const id = idOf('A/a.pdf');
    setFavorite(db, id, true);
    updateThumb(db, id, { thumbPath: '/t.png', pageCount: 4, isEncrypted: true });

    expect(applyScan(db, scan([info('A/a.pdf')]))).toEqual({ added: 0, updated: 0, removed: 0 });
    let row = db.select().from(files).where(eq(files.id, id)).get();
    expect(row).toMatchObject({ thumbPath: '/t.png', pageCount: 4, isEncrypted: true });

    const diff = applyScan(db, scan([info('A/a.pdf', { modifiedAt: 9999 })]));
    expect(diff).toEqual({ added: 0, updated: 1, removed: 0 });
    row = db.select().from(files).where(eq(files.id, id)).get();
    expect(row).toMatchObject({
      isFavorite: true,
      thumbPath: null,
      pageCount: null,
      isEncrypted: false,
      modifiedAt: 9999,
    });
  });

  it('removes files missing from the rescan', () => {
    const db = makeDb();
    applyScan(db, scan([info('A/a.pdf'), info('A/b.pdf')]));
    expect(applyScan(db, scan([info('A/a.pdf')]))).toEqual({ added: 0, updated: 0, removed: 1 });
    expect(listFiles(db).map((r) => r.name)).toEqual(['a.pdf']);
  });

  it('keeps rows under roots that were not scanned or that failed', () => {
    const db = makeDb();
    const SD = 'file:///storage/1A2B-3C4D';
    const BAD = 'file:///storage/FAIL-0000';
    applyScan(
      db,
      scan(
        [
          info('A/a.pdf'),
          {
            ...info('x', { name: 's.pdf' }),
            uri: `${SD}/s.pdf`,
            parentUri: SD,
          },
          { ...info('x', { name: 'f.pdf' }), uri: `${BAD}/f.pdf`, parentUri: BAD },
        ],
        [ROOT, SD, BAD],
      ),
    );
    expect(listFiles(db)).toHaveLength(3);
    const diff = applyScan(db, scan([info('A/a.pdf')], [ROOT], [BAD]));
    expect(diff.removed).toBe(0);
    expect(listFiles(db)).toHaveLength(3);
    // a root listed as scanned AND failed is still protected
    applyScan(db, scan([], [ROOT, BAD], [BAD]));
    expect(listFiles(db).map((r) => r.name)).toContain('f.pdf');
  });

  it('does not delete non-scan sources on a scan rescan', () => {
    const db = makeDb();
    upsertFile(db, info('Out/o.pdf'), 'output');
    applyScan(db, scan([info('A/a.pdf')]));
    expect(
      listFiles(db)
        .map((r) => r.name)
        .sort(),
    ).toEqual(['a.pdf', 'o.pdf']);
  });

  it('replaces folder stamps with the distinct parents of the result', () => {
    const db = makeDb();
    applyScan(
      db,
      scan([
        info('A/a.pdf', { parentModifiedAt: 11 }),
        info('A/b.pdf', { parentModifiedAt: 11 }),
        info('B/c.pdf', { parentModifiedAt: 22 }),
      ]),
    );
    expect(getFolderStamps(db).sort((a, b) => a.uri.localeCompare(b.uri))).toEqual([
      { uri: `${ROOT}/A`, modifiedAt: 11 },
      { uri: `${ROOT}/B`, modifiedAt: 22 },
    ]);
    applyScan(db, scan([info('B/c.pdf', { parentModifiedAt: 22 })]));
    expect(getFolderStamps(db)).toEqual([{ uri: `${ROOT}/B`, modifiedAt: 22 }]);
  });

  it('does not touch stamps for saf source', () => {
    const db = makeDb();
    applyScan(db, scan([info('A/a.pdf')]));
    applyScan(db, { result: { files: [], scannedRoots: [], failedRoots: [] }, source: 'saf' });
    expect(getFolderStamps(db)).toHaveLength(1);
  });

  it('is fast for 1,000 files, including an identical rescan', () => {
    const db = makeDb();
    const many = Array.from({ length: 1000 }, (_, i) => info(`D${i % 20}/f${i}.pdf`));
    let t = Date.now();
    expect(applyScan(db, scan(many)).added).toBe(1000);
    expect(Date.now() - t).toBeLessThan(1000);
    t = Date.now();
    expect(applyScan(db, scan(many))).toEqual({ added: 0, updated: 0, removed: 0 });
    expect(Date.now() - t).toBeLessThan(1000);
  });
});

describe('applyFolderChanges', () => {
  const change = (c: Partial<FolderChange> & { uri: string }): FolderChange => ({
    exists: true,
    modifiedAt: 7777,
    files: [],
    ...c,
  });

  it('adds new, removes missing, stores stamp', () => {
    const db = makeDb();
    applyScan(db, scan([info('A/a.pdf'), info('A/b.pdf'), info('B/c.pdf')]));
    const diff = applyFolderChanges(db, [
      change({ uri: `${ROOT}/A`, files: [info('A/a.pdf'), info('A/new.pdf')] }),
    ]);
    expect(diff).toEqual({ added: 1, updated: 0, removed: 1 });
    expect(
      listFiles(db)
        .map((r) => r.name)
        .sort(),
    ).toEqual(['a.pdf', 'c.pdf', 'new.pdf']);
    expect(getFolderStamps(db)).toContainEqual({ uri: `${ROOT}/A`, modifiedAt: 7777 });
  });

  it('removes rows and stamp of a vanished folder', () => {
    const db = makeDb();
    applyScan(db, scan([info('A/a.pdf'), info('B/c.pdf')]));
    const diff = applyFolderChanges(db, [change({ uri: `${ROOT}/A`, exists: false })]);
    expect(diff.removed).toBe(1);
    expect(listFiles(db).map((r) => r.name)).toEqual(['c.pdf']);
    expect(getFolderStamps(db).map((s) => s.uri)).toEqual([`${ROOT}/B`]);
  });
});

describe('single-file operations', () => {
  it('upsertFile keeps old parentUri/folder when native returns empty ones', () => {
    const db = makeDb();
    const first = upsertFile(db, info('A/a.pdf'), 'saf');
    const again = upsertFile(
      db,
      info('A/a.pdf', { parentUri: '', folder: '', sizeBytes: 5 }),
      'saf',
    );
    expect(again.id).toBe(first.id);
    expect(again).toMatchObject({ parentUri: `${ROOT}/A`, folder: 'A', sizeBytes: 5 });
  });

  it('replaceFile keeps favourite, thumb data and moves bookmarks', () => {
    const db = makeDb();
    const old = upsertFile(db, info('A/a.pdf'), 'scan');
    setFavorite(db, old.id, true);
    markOpened(db, old.id, 123);
    updateThumb(db, old.id, { thumbPath: '/t.png', pageCount: 3 });
    db.insert(bookmarks)
      .values([
        { fileId: old.id, page: 1, createdAt: 1 },
        { fileId: old.id, page: 2, createdAt: 2 },
      ])
      .run();

    const next = replaceFile(db, old.id, info('A/renamed.pdf', { parentUri: '' }), 'scan');
    expect(next.id).toBe(idOf('A/renamed.pdf'));
    expect(next).toMatchObject({
      isFavorite: true,
      lastOpenedAt: 123,
      thumbPath: '/t.png',
      pageCount: 3,
      parentUri: `${ROOT}/A`,
    });
    expect(db.select().from(bookmarks).where(eq(bookmarks.fileId, next.id)).all()).toHaveLength(2);
    expect(db.select().from(bookmarks).where(eq(bookmarks.fileId, old.id)).all()).toHaveLength(0);
    expect(listFiles(db)).toHaveLength(1);
  });

  it('removeFile and deleteBySource', () => {
    const db = makeDb();
    const a = upsertFile(db, info('A/a.pdf'), 'scan');
    upsertFile(db, info('O/o1.pdf'), 'output');
    upsertFile(db, info('O/o2.pdf'), 'output');
    removeFile(db, a.id);
    expect(listFiles(db)).toHaveLength(2);
    expect(deleteBySource(db, 'output')).toBe(2);
    expect(listFiles(db)).toHaveLength(0);
  });
});

describe('scan roots', () => {
  it('adds (ignoring duplicates), lists and removes with saf rows only', () => {
    const db = makeDb();
    const tree = 'content://auth/tree/primary%3ADocs';
    addScanRoot(db, { uri: tree, label: 'Docs', addedAt: 1 });
    addScanRoot(db, { uri: tree, label: 'Docs again', addedAt: 2 });
    expect(listScanRoots(db)).toEqual([{ uri: tree, label: 'Docs', addedAt: 1 }]);

    upsertFile(db, { ...info('x', { name: 's1.pdf' }), uri: `${tree}/document/s1.pdf` }, 'saf');
    upsertFile(db, { ...info('x', { name: 's2.pdf' }), uri: `${tree}/document/s2.pdf` }, 'saf');
    upsertFile(db, info('A/a.pdf'), 'scan');
    upsertFile(
      db,
      { ...info('x', { name: 'o.pdf' }), uri: 'content://auth/tree/other/document/o.pdf' },
      'saf',
    );
    expect(removeScanRoot(db, tree)).toBe(2);
    expect(listScanRoots(db)).toHaveLength(0);
    expect(
      listFiles(db)
        .map((r) => r.name)
        .sort(),
    ).toEqual(['a.pdf', 'o.pdf']);
  });
});
