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
  clearThumbPaths,
  deleteBySource,
  getFile,
  getFolderStamps,
  isUnderRoot,
  listFiles,
  listScanRoots,
  markOpened,
  removeFile,
  removeScanRoot,
  replaceFile,
  setFavorite,
  setLastPage,
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

  it('persists isCorrupt and resets it when the file content changes', () => {
    const db = makeDb();
    applyScan(db, scan([info('A/a.pdf')]));
    const id = idOf('A/a.pdf');
    updateThumb(db, id, { isCorrupt: true });
    applyScan(db, scan([info('A/a.pdf')]));
    expect(db.select().from(files).where(eq(files.id, id)).get()?.isCorrupt).toBe(true);

    applyScan(db, scan([info('A/a.pdf', { sizeBytes: 200 })]));
    expect(db.select().from(files).where(eq(files.id, id)).get()?.isCorrupt).toBe(false);

    updateThumb(db, id, { isCorrupt: true });
    applyFolderChanges(db, [
      {
        uri: `${ROOT}/A`,
        modifiedAt: 2,
        exists: true,
        files: [info('A/a.pdf', { modifiedAt: 1 })],
      },
    ]);
    expect(db.select().from(files).where(eq(files.id, id)).get()?.isCorrupt).toBe(false);
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

  it('keeps rows under a failed subfolder of a scanned root', () => {
    const db = makeDb();
    applyScan(db, scan([info('A/a.pdf'), info('B/b.pdf')]));
    const diff = applyScan(db, scan([info('B/b.pdf')], [ROOT], [`${ROOT}/A`]));
    expect(diff.removed).toBe(0);
    expect(
      listFiles(db)
        .map((r) => r.name)
        .sort(),
    ).toEqual(['a.pdf', 'b.pdf']);
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

describe('applyScan: bulk change detection', () => {
  const bulk = () =>
    Array.from({ length: 150 }, (_, i) =>
      info(`D${i % 5}/f${i}${i % 7 === 0 ? '-\u{1F4C4}-\u0905\u0939' : ''}.pdf`),
    );

  it('reports exactly the changed rows of a large rescan (emoji and Devanagari names stable)', () => {
    const db = makeDb();
    const first = bulk();
    applyScan(db, scan(first));
    setFavorite(db, fileIdForUri(first[3]!.uri), true);
    const next = first.map((f, i) =>
      i === 3 ? { ...f, sizeBytes: 999 } : i === 4 ? { ...f, folder: 'Renamed' } : f,
    );
    expect(applyScan(db, scan(next))).toEqual({ added: 0, updated: 2, removed: 0 });
    expect(getFile(db, fileIdForUri(first[3]!.uri))).toMatchObject({
      sizeBytes: 999,
      isFavorite: true,
    });
    expect(getFile(db, fileIdForUri(first[4]!.uri))?.folder).toBe('Renamed');
    expect(applyScan(db, scan(next))).toEqual({ added: 0, updated: 0, removed: 0 });
  });

  it('treats an empty native folder/parentUri as "keep the old value" in a large rescan', () => {
    const db = makeDb();
    const first = bulk();
    applyScan(db, scan(first));
    const next = first.map((f, i) => (i === 10 ? { ...f, folder: '', parentUri: '' } : f));
    expect(applyScan(db, scan(next))).toEqual({ added: 0, updated: 0, removed: 0 });
    expect(getFile(db, fileIdForUri(first[10]!.uri))).toMatchObject({
      folder: first[10]!.folder,
      parentUri: first[10]!.parentUri,
    });
  });

  it('counts a row whose stored parentUri is null as updated', () => {
    const db = makeDb();
    const first = bulk();
    applyScan(db, scan(first));
    db.update(files)
      .set({ parentUri: null })
      .where(eq(files.id, fileIdForUri(first[0]!.uri)))
      .run();
    expect(applyScan(db, scan(first))).toEqual({ added: 0, updated: 1, removed: 0 });
  });

  it('removes missing rows of a large rescan but keeps failed subfolders and other sources', () => {
    const db = makeDb();
    const first = bulk();
    applyScan(db, scan(first));
    upsertFile(db, info('Out/o.pdf'), 'output');
    // D1 could not be listed this time; f0 (in D0) and f2 (in D2) are gone.
    const next = first.filter((_, i) => i % 5 !== 1 && i !== 0 && i !== 2);
    const diff = applyScan(db, scan(next, [ROOT], [`${ROOT}/D1`]));
    expect(diff).toEqual({ added: 0, updated: 0, removed: 2 });
    expect(listFiles(db)).toHaveLength(149);
    expect(getFile(db, fileIdForUri(first[1]!.uri))).toBeDefined();
    expect(getFile(db, idOf('Out/o.pdf'))?.source).toBe('output');
  });

  it('does not count a scan hit on an output row as an update', () => {
    const db = makeDb();
    const first = bulk();
    applyScan(db, scan(first));
    upsertFile(db, first[0]!, 'output');
    expect(applyScan(db, scan(first))).toEqual({ added: 0, updated: 0, removed: 0 });
    expect(getFile(db, fileIdForUri(first[0]!.uri))?.source).toBe('output');
  });
});

describe('source promotion', () => {
  it('upsertFile with output promotes a scan row; scans never demote it', () => {
    const db = makeDb();
    applyScan(db, scan([info('Out/x.pdf')]));
    const row = upsertFile(db, info('Out/x.pdf'), 'output');
    expect(row.source).toBe('output');
    expect(deleteBySource(db, 'scan')).toBe(0);
    expect(listFiles(db)).toHaveLength(1);
    applyScan(db, scan([info('Out/x.pdf', { sizeBytes: 999 })]));
    applyFolderChanges(db, [
      { uri: `${ROOT}/Out`, exists: true, modifiedAt: 1, files: [info('Out/x.pdf')] },
    ]);
    expect(listFiles(db)[0]?.source).toBe('output');
  });

  it('intent promotes scan but a scan upsert does not demote intent', () => {
    const db = makeDb();
    applyScan(db, scan([info('A/a.pdf')]));
    expect(upsertFile(db, info('A/a.pdf'), 'intent').source).toBe('intent');
    expect(upsertFile(db, info('A/a.pdf'), 'scan').source).toBe('intent');
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

  it('getFile returns the row or undefined', () => {
    const db = makeDb();
    const a = upsertFile(db, info('A/a.pdf'), 'scan');
    expect(getFile(db, a.id)).toEqual(a);
    expect(getFile(db, 'nope')).toBeUndefined();
  });

  it('replaceFile keeps isCorrupt', () => {
    const db = makeDb();
    const old = upsertFile(db, info('A/a.pdf'), 'scan');
    updateThumb(db, old.id, { isCorrupt: true });
    expect(replaceFile(db, old.id, info('A/b.pdf'), 'scan').isCorrupt).toBe(true);
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

describe('app-folder output rows are adopted by scans (one row per moved file)', () => {
  const MEDIA = 'content://media/external/file/42';
  const TREE = 'content://com.android.externalstorage.documents/tree/primary%3ADocuments';
  const SAF_DOC = `${TREE}/document/primary%3ADocuments%2FPDFToolkit%2Fx.pdf`;

  /** What a SAF-mode "Move to PDFToolkit folder" records: a MediaStore uri as output. */
  function movedOutput(db: ReturnType<typeof makeDb>, over: Partial<PdfFileInfo> = {}) {
    const row = upsertFile(
      db,
      {
        uri: MEDIA,
        name: 'x.pdf',
        folder: 'Documents/PDFToolkit',
        parentUri: `${ROOT}/Documents/PDFToolkit`,
        parentModifiedAt: 0,
        sizeBytes: 100,
        // MediaStore DATE_MODIFIED has second precision.
        modifiedAt: 1_700_000_000_000,
        ...over,
      },
      'output',
    );
    setFavorite(db, row.id, true);
    markOpened(db, row.id, 77);
    db.update(files).set({ lastPage: 3 }).where(eq(files.id, row.id)).run();
    db.insert(bookmarks).values({ fileId: row.id, page: 2, createdAt: 1 }).run();
    return row;
  }

  const safDoc = (over: Partial<PdfFileInfo> = {}): PdfFileInfo => ({
    uri: SAF_DOC,
    name: 'x.pdf',
    folder: 'Documents/PDFToolkit',
    parentUri: `${TREE}/document/primary%3ADocuments%2FPDFToolkit`,
    parentModifiedAt: 0,
    sizeBytes: 100,
    modifiedAt: 1_700_000_000_456,
    ...over,
  });

  it('a SAF scan of Documents keeps one output row and moves favourite, lastPage, lastOpenedAt, bookmarks', () => {
    const db = makeDb();
    const output = movedOutput(db);
    const diff = applyScan(db, {
      result: { files: [safDoc()], scannedRoots: [TREE], failedRoots: [] },
      source: 'saf',
    });
    const rows = listFiles(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: fileIdForUri(SAF_DOC),
      // Scans never demote an output row.
      source: 'output',
      isFavorite: true,
      lastPage: 3,
      lastOpenedAt: 77,
    });
    expect(db.select().from(bookmarks).where(eq(bookmarks.fileId, rows[0]!.id)).all()).toHaveLength(
      1,
    );
    expect(getFile(db, output.id)).toBeUndefined();
    expect(diff.added + diff.updated + diff.removed).toBeGreaterThan(0);
    // The next scan of the same tree is a no-op: still one row.
    const again = applyScan(db, {
      result: { files: [safDoc()], scannedRoots: [TREE], failedRoots: [] },
      source: 'saf',
    });
    expect(again).toEqual({ added: 0, updated: 0, removed: 0 });
    expect(listFiles(db)).toHaveLength(1);
  });

  it('a full-access scan after a SAF move keeps one file:// row with the favourite', () => {
    const db = makeDb();
    movedOutput(db);
    applyScan(db, scan([info('Documents/PDFToolkit/x.pdf', { modifiedAt: 1_700_000_000_999 })]));
    const rows = listFiles(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: idOf('Documents/PDFToolkit/x.pdf'),
      source: 'output',
      isFavorite: true,
      lastPage: 3,
    });
  });

  it('a large scan adopts the output row too', () => {
    const db = makeDb();
    movedOutput(db);
    const many = Array.from({ length: 150 }, (_, i) => info(`D/f${i}.pdf`));
    applyScan(
      db,
      scan([...many, info('Documents/PDFToolkit/x.pdf', { modifiedAt: 1_700_000_000_001 })]),
    );
    expect(listFiles(db)).toHaveLength(151);
    expect(getFile(db, idOf('Documents/PDFToolkit/x.pdf'))?.isFavorite).toBe(true);
  });

  it('leaves output rows alone when content or location differ', () => {
    const db = makeDb();
    const output = movedOutput(db);
    const elsewhere = movedOutput(db, {
      uri: 'content://media/external/file/43',
      folder: 'Download',
      parentUri: `${ROOT}/Download`,
    });
    applyScan(
      db,
      scan([
        info('Documents/PDFToolkit/x.pdf', { sizeBytes: 101, modifiedAt: 1_700_000_000_000 }),
        info('Download/x.pdf', { modifiedAt: 1_700_000_000_000 }),
      ]),
    );
    expect(getFile(db, output.id)?.source).toBe('output');
    expect(getFile(db, elsewhere.id)?.source).toBe('output');
    expect(listFiles(db)).toHaveLength(4);
  });

  it('two real copies with the same name, size and second are never merged and do not flip-flop (R2)', () => {
    const db = makeDb();
    movedOutput(db);
    const run = () =>
      applyScan(
        db,
        scan([
          info('Documents/PDFToolkit/x.pdf', { modifiedAt: 1_700_000_000_100 }),
          info('Documents/PDFToolkit/old/x.pdf', { modifiedAt: 1_700_000_000_200 }),
        ]),
      );
    const ids = [idOf('Documents/PDFToolkit/x.pdf'), idOf('Documents/PDFToolkit/old/x.pdf')];
    for (let i = 0; i < 3; i++) {
      const diff = run();
      const rows = listFiles(db);
      expect(rows.map((r) => r.id).sort()).toEqual([...ids].sort());
      expect(rows.find((r) => r.id === ids[0])).toMatchObject({
        isFavorite: true,
        source: 'output',
      });
      if (i > 0) expect(diff).toEqual({ added: 0, updated: 0, removed: 0 });
    }
  });

  it('never adopts an output row the scan reached directly', () => {
    const db = makeDb();
    upsertFile(db, info('Documents/PDFToolkit/x.pdf'), 'output');
    applyScan(db, scan([info('Documents/PDFToolkit/x.pdf'), info('Documents/PDFToolkit/y/x.pdf')]));
    expect(listFiles(db)).toHaveLength(2);
    expect(getFile(db, idOf('Documents/PDFToolkit/x.pdf'))?.source).toBe('output');
    expect(getFile(db, idOf('Documents/PDFToolkit/y/x.pdf'))).toBeDefined();
  });

  it('only adopts MediaStore output rows into the primary app folder', () => {
    const db = makeDb();
    const saf = upsertFile(
      db,
      {
        uri: SAF_DOC,
        name: 'x.pdf',
        folder: 'Documents/PDFToolkit',
        parentUri: `${TREE}/document/primary%3ADocuments%2FPDFToolkit`,
        parentModifiedAt: 0,
        sizeBytes: 100,
        modifiedAt: 1_700_000_000_000,
      },
      'output',
    );
    applyScan(db, scan([info('Documents/PDFToolkit/x.pdf', { modifiedAt: 1_700_000_000_000 })]));
    expect(getFile(db, saf.id)).toBeDefined();
    expect(listFiles(db)).toHaveLength(2);

    const db2 = makeDb();
    const media = movedOutput(db2);
    const sd = 'file:///storage/1A2B-3C4D';
    applyScan(
      db2,
      scan(
        [
          {
            ...info('Documents/PDFToolkit/x.pdf', {
              modifiedAt: 1_700_000_000_000,
              folder: 'Documents/PDFToolkit',
            }),
            uri: `${sd}/Documents/PDFToolkit/x.pdf`,
            parentUri: `${sd}/Documents/PDFToolkit`,
          },
        ],
        [sd],
      ),
    );
    expect(getFile(db2, media.id)).toBeDefined();
    expect(listFiles(db2)).toHaveLength(2);
  });
});

describe('setLastPage', () => {
  it('stores the last page', () => {
    const db = makeDb();
    const id = upsertFile(db, info('A/a.pdf'), 'scan').id;
    setLastPage(db, id, 57);
    expect(getFile(db, id)?.lastPage).toBe(57);
  });
});

describe('clearThumbPaths', () => {
  it('nulls every stored thumbnail path and counts them', () => {
    const db = makeDb();
    applyScan(db, scan([info('A/a.pdf'), info('A/b.pdf'), info('A/c.pdf')]));
    updateThumb(db, idOf('A/a.pdf'), { thumbPath: 'file:///t/a.jpg' });
    updateThumb(db, idOf('A/b.pdf'), { thumbPath: 'file:///t/b.jpg' });
    expect(clearThumbPaths(db)).toBe(2);
    expect(listFiles(db).every((r) => r.thumbPath === null)).toBe(true);
    expect(clearThumbPaths(db)).toBe(0);
  });
});
