/**
 * @jest-environment node
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { PdfFileInfo } from '@/services/native/pdfNative';
import { fileIdForUri } from '@/utils/fileId';

import { listBookmarks, removeBookmark, toggleBookmark } from '../bookmarkRepo';
import { removeFile, upsertFile } from '../fileIndexRepo';

function makeDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = OFF');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  sqlite.pragma('foreign_keys = ON');
  return db;
}

function info(uri: string): PdfFileInfo {
  return {
    uri,
    name: 'x.pdf',
    folder: 'A',
    parentUri: 'file:///A',
    parentModifiedAt: 1,
    sizeBytes: 1,
    modifiedAt: 1,
  };
}

function seed(db: ReturnType<typeof makeDb>) {
  const a = upsertFile(db, info('file:///A/a.pdf'), 'scan').id;
  const b = upsertFile(db, info('file:///A/b.pdf'), 'scan').id;
  return { a, b };
}

describe('bookmarkRepo', () => {
  it('toggles a bookmark on and off', () => {
    const db = makeDb();
    const { a } = seed(db);
    expect(toggleBookmark(db, { fileId: a, page: 57, now: 1 })).toEqual({ bookmarked: true });
    expect(listBookmarks(db, a)).toMatchObject([{ page: 57, label: '', createdAt: 1 }]);
    expect(toggleBookmark(db, { fileId: a, page: 57, now: 2 })).toEqual({ bookmarked: false });
    expect(listBookmarks(db, a)).toEqual([]);
  });

  it('lists by page then creation time, per file', () => {
    const db = makeDb();
    const { a, b } = seed(db);
    for (const page of [9, 2, 5]) toggleBookmark(db, { fileId: a, page, now: page });
    toggleBookmark(db, { fileId: b, page: 1, now: 1 });
    expect(listBookmarks(db, a).map((r) => r.page)).toEqual([2, 5, 9]);
    expect(listBookmarks(db, b).map((r) => r.page)).toEqual([1]);
  });

  it('removes one bookmark by id', () => {
    const db = makeDb();
    const { a } = seed(db);
    toggleBookmark(db, { fileId: a, page: 1, now: 1 });
    toggleBookmark(db, { fileId: a, page: 2, now: 2 });
    const [first] = listBookmarks(db, a);
    removeBookmark(db, first?.id ?? -1);
    expect(listBookmarks(db, a).map((r) => r.page)).toEqual([2]);
  });

  it('cascades when the file row is removed', () => {
    const db = makeDb();
    const { a } = seed(db);
    toggleBookmark(db, { fileId: a, page: 3, now: 1 });
    removeFile(db, a);
    expect(listBookmarks(db, a)).toEqual([]);
    expect(a).toBe(fileIdForUri('file:///A/a.pdf'));
  });
});
