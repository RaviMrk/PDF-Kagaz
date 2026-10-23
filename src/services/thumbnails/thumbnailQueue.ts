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
  /** Content version the result was generated from; ignore it if the row changed since. */
  modifiedAt: number;
  sizeBytes: number;
};

type Deps = {
  native: Pick<PdfNativeApi, 'generateThumbnail' | 'getPageCount'>;
  width: number;
  concurrency?: number;
  onResult: (r: ThumbResult) => void;
};

type Job = Pick<FileRow, 'id' | 'uri' | 'modifiedAt' | 'sizeBytes'>;

/** De-dup key: a content change (rescan reset) makes the same id eligible again. */
const keyOf = (j: Job) => `${j.id}|${j.modifiedAt}|${j.sizeBytes}`;

/** Lazy, LIFO thumbnail generation: the rows just rendered are served first. */
export function createThumbnailQueue(deps: Deps) {
  const concurrency = deps.concurrency ?? 2;
  const pending: Job[] = [];
  const seen = new Set<string>(); // job keys queued, running, done or failed this session
  let running = 0;

  const empty = ({ id, modifiedAt, sizeBytes }: Job): ThumbResult => ({
    id,
    modifiedAt,
    sizeBytes,
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
      return { ...empty(job), thumbPath, pageCount };
    } catch (e) {
      if (isPdfNativeError(e, 'ERR_PDF_ENCRYPTED')) return { ...empty(job), isEncrypted: true };
      if (isPdfNativeError(e, 'ERR_PDF_INVALID')) return { ...empty(job), invalid: true };
      if (isPdfNativeError(e, 'ERR_FILE_NOT_FOUND')) return { ...empty(job), missing: true };
      // Other errors (incl. ERR_VOLUME_UNAVAILABLE: SD card removed, the row stays): no result,
      // not retried this session.
      return null;
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

  function request(file: Job): void {
    const job: Job = {
      id: file.id,
      uri: file.uri,
      modifiedAt: file.modifiedAt,
      sizeBytes: file.sizeBytes,
    };
    if (seen.has(keyOf(job))) return;
    seen.add(keyOf(job));
    pending.push(job);
    pump();
  }

  return {
    request,
    /** Runs a job again although its key was seen (its cached thumbnail file disappeared). */
    retry(file: Job): void {
      seen.delete(keyOf(file));
      request(file);
    },
    /** Forgets what was queued or done this session (the cache was cleared). */
    reset(): void {
      pending.length = 0;
      seen.clear();
    },
    clear(): void {
      for (const j of pending) seen.delete(keyOf(j));
      pending.length = 0;
    },
  };
}
