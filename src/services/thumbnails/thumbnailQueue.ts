import type { FileRow } from '@/db/schema';
import { isPdfNativeError, type PdfNativeApi } from '@/services/native/pdfNative';

export type ThumbResult = {
  id: string;
  thumbPath: string | null;
  pageCount: number | null;
  isEncrypted: boolean;
  missing: boolean;
  /** Corrupt PDF (ERR_PDF_INVALID): persist it so it is not re-requested every launch. */
  invalid: boolean;
};

type Deps = {
  native: Pick<PdfNativeApi, 'generateThumbnail' | 'getPageCount'>;
  width: number;
  concurrency?: number;
  onResult: (r: ThumbResult) => void;
};

type Job = Pick<FileRow, 'id' | 'uri'>;

/** Lazy, LIFO thumbnail generation: the rows just rendered are served first. */
export function createThumbnailQueue(deps: Deps) {
  const concurrency = deps.concurrency ?? 2;
  const pending: Job[] = [];
  const seen = new Set<string>(); // queued, running, done or failed this session
  let running = 0;

  const empty = (id: string): ThumbResult => ({
    id,
    thumbPath: null,
    pageCount: null,
    isEncrypted: false,
    missing: false,
    invalid: false,
  });

  async function generate(job: Job): Promise<ThumbResult | null> {
    try {
      const pageCount = await deps.native.getPageCount(job.uri);
      const thumbPath = await deps.native.generateThumbnail(job.uri, 1, deps.width);
      return { ...empty(job.id), thumbPath, pageCount };
    } catch (e) {
      if (isPdfNativeError(e, 'ERR_PDF_ENCRYPTED')) return { ...empty(job.id), isEncrypted: true };
      if (isPdfNativeError(e, 'ERR_PDF_INVALID')) return { ...empty(job.id), invalid: true };
      if (isPdfNativeError(e, 'ERR_FILE_NOT_FOUND')) return { ...empty(job.id), missing: true };
      return null; // other errors: no result, not retried this session
    }
  }

  async function process(job: Job): Promise<void> {
    const result = await generate(job);
    if (result) deps.onResult(result);
  }

  function pump(): void {
    while (running < concurrency && pending.length > 0) {
      const job = pending.pop() as Job;
      running++;
      void process(job).finally(() => {
        running--;
        pump();
      });
    }
  }

  return {
    request(file: Job): void {
      if (seen.has(file.id)) return;
      seen.add(file.id);
      pending.push({ id: file.id, uri: file.uri });
      pump();
    },
    clear(): void {
      for (const j of pending) seen.delete(j.id);
      pending.length = 0;
    },
  };
}
