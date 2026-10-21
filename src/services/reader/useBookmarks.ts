import { useCallback, useState } from 'react';

import { getDb } from '@/db/client';
import type { BookmarkRow } from '@/db/schema';
import { listBookmarks, removeBookmark, toggleBookmark } from '@/services/index/bookmarkRepo';
import type { IndexDb } from '@/services/index/fileIndexRepo';
import { toggleReaderBookmark } from '@/services/reader/readerActions';

type Deps = { getDb: () => IndexDb; now: () => number };

const DEFAULT_DEPS: Deps = { getDb, now: Date.now };

function read(fileId: string, deps: Deps): BookmarkRow[] | null {
  try {
    return listBookmarks(deps.getDb(), fileId);
  } catch {
    return null;
  }
}

/** The bookmarks of one file. Database errors leave the list unchanged; nothing here throws. */
export function useBookmarks(
  fileId: string,
  deps: Deps = DEFAULT_DEPS,
): {
  bookmarks: BookmarkRow[];
  isBookmarked(page: number): boolean;
  toggle(page: number): void;
  remove(id: number): void;
} {
  const [state, setState] = useState(() => ({ fileId, rows: read(fileId, deps) ?? [] }));
  // Another file: reload during render (no stale rows from the previous file are ever shown).
  let current = state;
  if (state.fileId !== fileId) {
    current = { fileId, rows: read(fileId, deps) ?? [] };
    setState(current);
  }
  const bookmarks = current.rows;

  const refresh = () => {
    const rows = read(fileId, deps);
    if (rows) setState({ fileId, rows });
  };

  const toggle = (page: number) => {
    const result = toggleReaderBookmark({ fileId, page }, (input) =>
      toggleBookmark(deps.getDb(), { ...input, now: deps.now() }),
    );
    if (result.ok) refresh();
  };

  const remove = (id: number) => {
    try {
      removeBookmark(deps.getDb(), id);
    } catch {
      return;
    }
    refresh();
  };

  const isBookmarked = useCallback(
    (page: number) => bookmarks.some((b) => b.page === page),
    [bookmarks],
  );

  return { bookmarks, isBookmarked, toggle, remove };
}
