import { desc, eq } from 'drizzle-orm';

import { signatures, type SignatureRow } from '@/db/schema';
import type { IndexDb } from '@/services/index/fileIndexRepo';

/** Saved signatures, newest first. */
export function listSignatures(db: IndexDb): SignatureRow[] {
  return db
    .select()
    .from(signatures)
    .orderBy(desc(signatures.createdAt), desc(signatures.id))
    .all();
}

export function addSignature(db: IndexDb, pngPath: string, now: number): SignatureRow {
  return db.insert(signatures).values({ pngPath, createdAt: now }).returning().get();
}

export function getSignature(db: IndexDb, id: number): SignatureRow | undefined {
  return db.select().from(signatures).where(eq(signatures.id, id)).get();
}

/** Deletes the row and returns it; undefined when there was none. */
export function deleteSignature(db: IndexDb, id: number): SignatureRow | undefined {
  return db.delete(signatures).where(eq(signatures.id, id)).returning().get();
}
