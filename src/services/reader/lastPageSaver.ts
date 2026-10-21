const isPage = (p: number) => Number.isInteger(p) && p >= 1;

export function createLastPageSaver(
  save: (page: number) => void,
  delayMs = 500,
): { update(page: number): void; flush(): void; cancel(): void } {
  let pending: number | null = null;
  let saved: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const flush = () => {
    clear();
    const page = pending;
    pending = null;
    if (page === null || page === saved) return;
    saved = page;
    save(page);
  };
  return {
    update(page) {
      if (!isPage(page)) return;
      pending = page;
      clear();
      timer = setTimeout(flush, delayMs);
    },
    flush,
    cancel() {
      clear();
      pending = null;
    },
  };
}
