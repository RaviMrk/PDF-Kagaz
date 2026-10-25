import type { FileRow } from '@/db/schema';
import type { FileActionError } from '@/stores/filesStore';

export type DeleteManyResult = {
  deleted: string[];
  failed: { id: string; error: FileActionError }[];
};

/**
 * Deletes the files one at a time through `remove` (the store's single-file delete), so each
 * goes through the same storage path and writer lock. A failure never stops the rest.
 */
export async function deleteFiles(
  ids: readonly string[],
  remove: (id: string) => Promise<FileActionError | null>,
): Promise<DeleteManyResult> {
  const result: DeleteManyResult = { deleted: [], failed: [] };
  for (const id of ids) {
    let error: FileActionError | null;
    try {
      error = await remove(id);
    } catch {
      error = 'unknown';
    }
    if (error) result.failed.push({ id, error });
    else result.deleted.push(id);
  }
  return result;
}

/** The favourite state a selection toggle sets: add unless every row is already a favourite. */
export function favoriteTarget(rows: readonly FileRow[]): boolean {
  return rows.some((r) => !r.isFavorite);
}
