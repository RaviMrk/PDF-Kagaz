import { act, renderHook } from '@testing-library/react-native';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { files } from '@/db/schema';
import type { IndexDb } from '@/services/index/fileIndexRepo';
import { makeRow } from '@/test-utils/fileRows';

import { useBookmarks } from '../useBookmarks';

function makeDb(): IndexDb {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = OFF');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  sqlite.pragma('foreign_keys = ON');
  return db;
}

const FILE = 'id-a.pdf';

describe('useBookmarks', () => {
  let db: IndexDb;
  let deps: { getDb: () => IndexDb; now: () => number };

  beforeEach(() => {
    db = makeDb();
    db.insert(files)
      .values(makeRow({ name: 'a.pdf' }))
      .run();
    deps = { getDb: () => db, now: () => 1000 };
  });

  it('adds a bookmark, reports it and removes it', async () => {
    const { result } = await renderHook(() => useBookmarks(FILE, deps));
    expect(result.current.bookmarks).toEqual([]);
    await act(async () => result.current.toggle(3));
    expect(result.current.isBookmarked(3)).toBe(true);
    expect(result.current.isBookmarked(4)).toBe(false);
    expect(result.current.bookmarks).toHaveLength(1);
    expect(result.current.bookmarks[0]).toMatchObject({ fileId: FILE, page: 3, createdAt: 1000 });
    await act(async () => result.current.remove(result.current.bookmarks[0]!.id));
    expect(result.current.bookmarks).toEqual([]);
    expect(result.current.isBookmarked(3)).toBe(false);
  });

  it('toggles an existing bookmark off', async () => {
    const { result } = await renderHook(() => useBookmarks(FILE, deps));
    await act(async () => result.current.toggle(7));
    await act(async () => result.current.toggle(7));
    expect(result.current.bookmarks).toEqual([]);
  });

  it('loads the bookmarks already stored for the file', async () => {
    const first = await renderHook(() => useBookmarks(FILE, deps));
    await act(async () => first.result.current.toggle(9));
    const { result } = await renderHook(() => useBookmarks(FILE, deps));
    expect(result.current.bookmarks.map((b) => b.page)).toEqual([9]);
  });

  it('leaves the list unchanged when the database fails', async () => {
    const { result } = await renderHook(() => useBookmarks(FILE, deps));
    await act(async () => result.current.toggle(2));
    const before = result.current.bookmarks;
    deps.getDb = () => {
      throw new Error('db closed');
    };
    await act(async () => result.current.toggle(5));
    await act(async () => result.current.remove(before[0]!.id));
    expect(result.current.bookmarks).toEqual(before);
  });

  it('ignores a bookmark for a file that is not in the index', async () => {
    const { result } = await renderHook(() => useBookmarks('id-gone.pdf', deps));
    await act(async () => result.current.toggle(1));
    expect(result.current.bookmarks).toEqual([]);
  });

  it('starts empty when the database cannot be opened', async () => {
    const { result } = await renderHook(() =>
      useBookmarks(FILE, {
        getDb: () => {
          throw new Error('no db');
        },
        now: () => 0,
      }),
    );
    expect(result.current.bookmarks).toEqual([]);
  });
});
