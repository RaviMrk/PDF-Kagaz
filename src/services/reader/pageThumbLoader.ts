import { isPdfNativeError, pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';

type Done = (uri: string | null) => void;

export type PageThumbLoader = {
  get(page: number): string | null | undefined;
  request(page: number, onDone: Done): void;
  cancelPending(): void;
};

export function createPageThumbLoader(deps: {
  fileUri: string;
  width: number;
  concurrency?: number;
  native?: Pick<PdfNativeApi, 'renderReaderThumbnail'>;
}): PageThumbLoader {
  const { fileUri, width, concurrency = 2, native = pdfNative } = deps;
  const cache = new Map<number, string | null>();
  const waiters = new Map<number, Done[]>();
  const queue: number[] = [];
  const inFlight = new Set<number>();
  let encrypted = false;

  /** [cached] false: a transient failure, answered null now and rendered again on the next request. */
  const settle = (page: number, uri: string | null, cached = true) => {
    if (cached) cache.set(page, uri);
    const cbs = waiters.get(page) ?? [];
    waiters.delete(page);
    for (const cb of cbs) {
      try {
        cb(uri);
      } catch {
        // A throwing listener must not break the queue.
      }
    }
  };

  const pump = () => {
    if (encrypted) {
      while (queue.length > 0) settle(queue.pop()!, null);
      return;
    }
    while (inFlight.size < concurrency && queue.length > 0) {
      const page = queue.pop()!; // LIFO: the newest request is the page on screen.
      inFlight.add(page);
      const onFail = (e: unknown) => {
        if (isPdfNativeError(e, 'ERR_PDF_ENCRYPTED')) encrypted = true;
        settle(
          page,
          null,
          isPdfNativeError(e, 'ERR_PDF_ENCRYPTED') || isPdfNativeError(e, 'ERR_PDF_INVALID'),
        );
      };
      let render: Promise<string>;
      try {
        render = native.renderReaderThumbnail(fileUri, page, width);
      } catch (e) {
        render = Promise.reject(e);
      }
      render
        .then((uri) => settle(page, uri), onFail)
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
