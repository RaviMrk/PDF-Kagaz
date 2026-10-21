import { and, asc, eq } from 'drizzle-orm';

import { bookmarks, type BookmarkRow } from '@/db/schema';
import type { IndexDb } from '@/services/index/fileIndexRepo';

export function listBookmarks(db: IndexDb, fileId: string): BookmarkRow[] {
  return db
    .select()
    .from(bookmarks)
    .where(eq(bookmarks.fileId, fileId))
    .orderBy(asc(bookmarks.page), asc(bookmarks.createdAt))
    .all();
}

/** Removes the bookmark(s) on that page, or adds one when there is none. */
export function toggleBookmark(
  db: IndexDb,
  input: { fileId: string; page: number; now: number },
): { bookmarked: boolean } {
  return db.transaction((tx) => {
    const match = and(eq(bookmarks.fileId, input.fileId), eq(bookmarks.page, input.page));
    const removed = tx.delete(bookmarks).where(match).run().changes;
    if (removed > 0) return { bookmarked: false };
    tx.insert(bookmarks)
      .values({ fileId: input.fileId, page: input.page, label: '', createdAt: input.now })
      .run();
    return { bookmarked: true };
  });
}

export function removeBookmark(db: IndexDb, id: number): void {
  db.delete(bookmarks).where(eq(bookmarks.id, id)).run();
}
