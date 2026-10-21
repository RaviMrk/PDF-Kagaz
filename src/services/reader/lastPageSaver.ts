const isPage = (p: number) => Number.isInteger(p) && p >= 1;

/**
 * Trailing-debounce saver. `save` may throw (the row can vanish while the reader is open): the
 * failure is swallowed, the page stays pending and the next flush retries it. `dispose` (and
 * `cancel`) are terminal, so a stray late `update` after unmount never writes.
 */
export function createLastPageSaver(
  save: (page: number) => void,
  delayMs = 500,
): { update(page: number): void; flush(): void; cancel(): void; dispose(): void } {
  let pending: number | null = null;
  let saved: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const flush = () => {
    clear();
    const page = pending;
    if (page === null) return;
    if (page === saved) {
      pending = null;
      return;
    }
    try {
      save(page);
      saved = page;
      pending = null;
    } catch {
      // Keep it pending; the next update or flush retries.
    }
  };
  return {
    update(page) {
      if (closed || !isPage(page)) return;
      pending = page;
      clear();
      timer = setTimeout(flush, delayMs);
    },
    flush,
    cancel() {
      closed = true;
      clear();
      pending = null;
    },
    dispose() {
      flush();
      closed = true;
      pending = null;
    },
  };
}
