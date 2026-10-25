/** @jest-environment node */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { IndexDb } from '@/services/index/fileIndexRepo';
import { listSignatures } from '@/services/signatures/signatureRepo';
import { createFakePdfNative, nativeError, type FakePdfNative } from '@/test-utils/fakePdfNative';

import { MAX_SIGNATURES, createSignaturesStore } from '../signaturesStore';

jest.mock('@/db/client', () => ({ getDb: jest.fn() }));

function makeDb(): IndexDb {
  const db = drizzle(new Database(':memory:'));
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  return db;
}

const sig = (n: number) => ({
  uri: `file:///data/files/signatures/sig-${n}-abc123.png`,
  width: 300,
  height: 100,
});

describe('signaturesStore', () => {
  let db: IndexDb;
  let native: FakePdfNative;
  let clock: number;
  let store: ReturnType<typeof createSignaturesStore>;

  beforeEach(() => {
    db = makeDb();
    native = createFakePdfNative();
    clock = 1000;
    store = createSignaturesStore({ getDb: () => db, native, now: () => clock++ });
  });

  it('saves a signature as a row, newest first', () => {
    const first = store.getState().save(sig(1));
    const second = store.getState().save(sig(2));
    expect(first).toMatchObject({ ok: true, row: { pngPath: sig(1).uri, createdAt: 1000 } });
    expect(second.ok).toBe(true);
    expect(store.getState().items.map((r) => r.pngPath)).toEqual([sig(2).uri, sig(1).uri]);
    expect(native.deleteSignatureFile).not.toHaveBeenCalled();
  });

  it('loads what is stored', () => {
    store.getState().save(sig(1));
    const other = createSignaturesStore({ getDb: () => db, native, now: () => 0 });
    expect(other.getState().items).toEqual([]);
    other.getState().load();
    expect(other.getState().items.map((r) => r.pngPath)).toEqual([sig(1).uri]);
  });

  it('refuses an 11th signature and deletes its file', () => {
    expect(MAX_SIGNATURES).toBe(10);
    for (let i = 0; i < 10; i++) expect(store.getState().save(sig(i)).ok).toBe(true);
    expect(store.getState().save(sig(11))).toEqual({ ok: false, reason: 'full' });
    expect(native.deleteSignatureFile).toHaveBeenCalledWith(sig(11).uri);
    expect(listSignatures(db)).toHaveLength(10);
    expect(store.getState().items).toHaveLength(10);
  });

  it('deletes the file when the insert fails', () => {
    const broken = createSignaturesStore({
      getDb: () => {
        throw new Error('db gone');
      },
      native,
      now: () => 0,
    });
    expect(broken.getState().save(sig(1))).toEqual({ ok: false, reason: 'db' });
    expect(native.deleteSignatureFile).toHaveBeenCalledWith(sig(1).uri);
  });

  it('does not fail the save when deleting a refused file rejects', async () => {
    native.deleteSignatureFile.mockRejectedValue(nativeError('ERR_IO'));
    for (let i = 0; i < 10; i++) store.getState().save(sig(i));
    expect(store.getState().save(sig(11))).toEqual({ ok: false, reason: 'full' });
    await Promise.resolve();
  });

  it('removes the row, then the file', async () => {
    const saved = store.getState().save(sig(1));
    if (!saved.ok) throw new Error('save failed');
    await expect(store.getState().remove(saved.row.id)).resolves.toBe(true);
    expect(listSignatures(db)).toEqual([]);
    expect(store.getState().items).toEqual([]);
    expect(native.deleteSignatureFile).toHaveBeenCalledWith(sig(1).uri);
  });

  it('still reports a removal when the file delete rejects', async () => {
    native.deleteSignatureFile.mockRejectedValue(nativeError('ERR_IO'));
    const saved = store.getState().save(sig(1));
    if (!saved.ok) throw new Error('save failed');
    await expect(store.getState().remove(saved.row.id)).resolves.toBe(true);
    expect(listSignatures(db)).toEqual([]);
  });

  it('reports false for an unknown id and leaves files alone', async () => {
    await expect(store.getState().remove(999)).resolves.toBe(false);
    expect(native.deleteSignatureFile).not.toHaveBeenCalled();
  });
});
