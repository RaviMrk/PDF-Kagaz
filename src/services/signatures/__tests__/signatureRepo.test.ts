/** @jest-environment node */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { IndexDb } from '@/services/index/fileIndexRepo';

import { addSignature, deleteSignature, getSignature, listSignatures } from '../signatureRepo';

function makeDb(): IndexDb {
  const db = drizzle(new Database(':memory:'));
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  return db;
}

describe('signatureRepo', () => {
  it('adds, lists newest first, gets and deletes', () => {
    const db = makeDb();
    const a = addSignature(db, 'file:///files/signatures/sig-1-aaaaaa.png', 1000);
    const b = addSignature(db, 'file:///files/signatures/sig-2-bbbbbb.png', 2000);
    expect(a).toMatchObject({
      pngPath: 'file:///files/signatures/sig-1-aaaaaa.png',
      createdAt: 1000,
    });
    expect(typeof a.id).toBe('number');
    expect(listSignatures(db).map((r) => r.id)).toEqual([b.id, a.id]);
    expect(getSignature(db, a.id)).toEqual(a);
    expect(deleteSignature(db, a.id)).toEqual(a);
    expect(getSignature(db, a.id)).toBeUndefined();
    expect(deleteSignature(db, a.id)).toBeUndefined();
    expect(listSignatures(db)).toEqual([b]);
  });

  it('orders rows with the same time by id, newest first', () => {
    const db = makeDb();
    const a = addSignature(db, 'file:///a.png', 5);
    const b = addSignature(db, 'file:///b.png', 5);
    expect(listSignatures(db).map((r) => r.id)).toEqual([b.id, a.id]);
  });
});
