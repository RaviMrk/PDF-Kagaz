import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

let sqlite: SQLiteDatabase | null = null;
let db: ExpoSQLiteDatabase | null = null;

/**
 * Lazy, memoised open. Throws on failure (and stays unopened so a retry re-attempts),
 * so callers must run it inside their own error handling, never at import time.
 * Foreign keys stay OFF here; src/db/bootstrap.ts enables them after migrations.
 */
export function getDb(): ExpoSQLiteDatabase {
  if (db) return db;
  const opened = openDatabaseSync('pdftoolkit.db');
  opened.execSync('PRAGMA journal_mode = WAL');
  sqlite = opened;
  db = drizzle(opened);
  return db;
}

/** Raw connection for pragmas; only valid after getDb() succeeded. */
export function getRawConnection() {
  if (!sqlite) throw new Error('Database is not open');
  const conn = sqlite;
  return {
    exec: (sql: string) => conn.execSync(sql),
    all: (sql: string) => conn.getAllSync(sql),
  };
}

export function resetDbForTests() {
  sqlite = null;
  db = null;
}
