import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

const sqlite = openDatabaseSync('pdftoolkit.db');
sqlite.execSync('PRAGMA foreign_keys = ON');
sqlite.execSync('PRAGMA journal_mode = WAL');

export const db = drizzle(sqlite);
