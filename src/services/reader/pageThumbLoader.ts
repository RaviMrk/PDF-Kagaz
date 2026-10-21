import { isPdfNativeError, pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';

type Done = (uri: string | null) => void;

export function createPageThumbLoader(deps: {
  fileUri: string;
  width: number;
  concurrency?: number;
  native?: Pick<PdfNativeApi, 'renderReaderThumbnail'>;
}): {
  get(page: number): string | null | undefined;
  request(page: number, onDone: Done): void;
  cancelPending(): void;
} {
  const { fileUri, width, concurrency = 2, native = pdfNative } = deps;
  const cache = new Map<number, string | null>();
  const waiters = new Map<number, Done[]>();
  const queue: number[] = [];
  const inFlight = new Set<number>();
  let encrypted = false;

  const settle = (page: number, uri: string | null) => {
    cache.set(page, uri);
    const cbs = waiters.get(page) ?? [];
    waiters.delete(page);
    cbs.forEach((cb) => cb(uri));
  };

  const pump = () => {
    if (encrypted) {
      while (queue.length > 0) settle(queue.pop()!, null);
      return;
    }
    while (inFlight.size < concurrency && queue.length > 0) {
      const page = queue.pop()!; // LIFO: the newest request is the page on screen.
      inFlight.add(page);
      native
        .renderReaderThumbnail(fileUri, page, width)
        .then(
          (uri) => settle(page, uri),
          (e) => {
            if (isPdfNativeError(e, 'ERR_PDF_ENCRYPTED')) encrypted = true;
            settle(page, null);
          },
        )
        .finally(() => {
          inFlight.delete(page);
          pump();
        });
    }
  };

  return {
    get: (page) => cache.get(page),
    request(page, onDone) {
      if (cache.has(page)) {
        onDone(cache.get(page)!);
        return;
      }
      if (encrypted) {
        onDone(null);
        return;
      }
      const list = waiters.get(page);
      if (list) list.push(onDone);
      else waiters.set(page, [onDone]);
      if (!inFlight.has(page)) {
        const at = queue.indexOf(page);
        if (at >= 0) queue.splice(at, 1);
        queue.push(page);
      }
      pump();
    },
    cancelPending() {
      for (const page of queue) waiters.delete(page);
      queue.length = 0;
    },
  };
}
