/**
 * @jest-environment node
 */
import Database from 'better-sqlite3';

import { finishStartup } from '../bootstrap';

const SETUP = `
CREATE TABLE files (id TEXT PRIMARY KEY, name TEXT);
CREATE TABLE bookmarks (id INTEGER PRIMARY KEY, file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE);
INSERT INTO files VALUES ('f1', 'a.pdf');
INSERT INTO bookmarks (file_id) VALUES ('f1'), ('f1');
`;

// drizzle-kit's table-rebuild pattern, run inside a transaction like drizzle's migrator.
const REBUILD = `
PRAGMA foreign_keys=OFF;
CREATE TABLE __new_files (id TEXT PRIMARY KEY, name TEXT, extra TEXT);
INSERT INTO __new_files (id, name) SELECT id, name FROM files;
DROP TABLE files;
ALTER TABLE __new_files RENAME TO files;
PRAGMA foreign_keys=ON;
`;

// better-sqlite3 enables foreign keys by default; expo-sqlite does not.
function open() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = OFF');
  return sqlite;
}

function bookmarkCount(sqlite: Database.Database) {
  return (sqlite.prepare('SELECT count(*) AS n FROM bookmarks').get() as { n: number }).n;
}

function conn(sqlite: Database.Database) {
  return {
    exec: (sql: string) => sqlite.exec(sql),
    all: (sql: string) => sqlite.prepare(sql).all(),
  };
}

describe('startup ordering', () => {
  it('keeps bookmarks when a table-rebuild migration runs before foreign keys are enabled', async () => {
    const sqlite = open();
    sqlite.exec(SETUP);
    await finishStartup(conn(sqlite), () => {
      sqlite.transaction(() => sqlite.exec(REBUILD))();
    });
    expect(bookmarkCount(sqlite)).toBe(2);
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('(proof) loses bookmarks with the old ordering: foreign keys ON before migrating', () => {
    const sqlite = open();
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(SETUP);
    sqlite.transaction(() => sqlite.exec(REBUILD))();
    expect(bookmarkCount(sqlite)).toBe(0);
  });

  it('throws when foreign_key_check reports violations', async () => {
    const sqlite = open();
    sqlite.exec(SETUP);
    sqlite.exec("INSERT INTO bookmarks (file_id) VALUES ('ghost')");
    await expect(finishStartup(conn(sqlite), () => {})).rejects.toThrow(/foreign key/i);
  });
});
