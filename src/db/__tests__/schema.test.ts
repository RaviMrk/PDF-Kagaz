/**
 * @jest-environment node
 */
import Database from 'better-sqlite3';
import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { bookmarks, files, toolJobs, type NewFileRow } from '../schema';

function makeDb() {
  const sqlite = new Database(':memory:');
  // Same order as the app (src/db/bootstrap.ts): migrate with FKs off, then enable them.
  sqlite.pragma('foreign_keys = OFF');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  sqlite.pragma('foreign_keys = ON');
  return db;
}

const baseFile = (overrides: Partial<NewFileRow> = {}): NewFileRow => ({
  id: 'f1',
  uri: 'content://docs/1',
  name: 'a.pdf',
  folder: 'Download',
  sizeBytes: 1024,
  modifiedAt: 1_700_000_000_000,
  source: 'scan',
  ...overrides,
});

describe('db schema', () => {
  it('applies defaults on files', () => {
    const db = makeDb();
    db.insert(files).values(baseFile()).run();
    const row = db.select().from(files).where(eq(files.id, 'f1')).get();
    expect(row?.isFavorite).toBe(false);
    expect(row?.isEncrypted).toBe(false);
    expect(row?.isCorrupt).toBe(false);
    expect(row?.lastPage).toBeNull();
  });

  it('rejects duplicate uri', () => {
    const db = makeDb();
    db.insert(files).values(baseFile()).run();
    expect(() =>
      db
        .insert(files)
        .values(baseFile({ id: 'f2' }))
        .run(),
    ).toThrow();
  });

  it('cascades bookmark delete with file', () => {
    const db = makeDb();
    db.insert(files).values(baseFile()).run();
    db.insert(bookmarks)
      .values([
        { fileId: 'f1', page: 1, createdAt: 1 },
        { fileId: 'f1', page: 2, label: 'x', createdAt: 2 },
      ])
      .run();
    expect(db.select({ n: count() }).from(bookmarks).get()?.n).toBe(2);
    db.delete(files).where(eq(files.id, 'f1')).run();
    const res = db.select({ n: count() }).from(bookmarks).get();
    expect(res?.n).toBe(0);
  });

  it('round-trips tool job JSON columns', () => {
    const db = makeDb();
    db.insert(toolJobs)
      .values({
        id: 'j1',
        toolId: 'split',
        inputIds: ['a', 'b'],
        options: { ranges: '1-3' },
        status: 'queued',
        startedAt: 1,
      })
      .run();
    const row = db.select().from(toolJobs).where(eq(toolJobs.id, 'j1')).get();
    expect(row?.inputIds).toEqual(['a', 'b']);
    expect(row?.options).toEqual({ ranges: '1-3' });
  });

  it('adds tool_jobs.output_ids defaulting to an empty array', () => {
    const sqlite = new Database(':memory:');
    migrate(drizzle(sqlite), { migrationsFolder: 'src/db/migrations' });
    const cols = sqlite.pragma('table_info(tool_jobs)') as { name: string; dflt_value: string }[];
    expect(cols.find((c) => c.name === 'output_ids')?.dflt_value).toBe("'[]'");
  });

  it('enforces bookmark foreign key', () => {
    const db = makeDb();
    expect(() =>
      db.insert(bookmarks).values({ fileId: 'nope', page: 1, createdAt: 1 }).run(),
    ).toThrow();
  });
});
