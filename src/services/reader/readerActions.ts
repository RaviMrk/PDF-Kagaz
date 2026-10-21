import { toggleBookmark } from '@/services/index/bookmarkRepo';
import { getDb } from '@/db/client';
import { isPdfNativeError, pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';

export type ReaderAction = 'share' | 'print' | 'openWith';
export type ReaderActionResult = 'ok' | 'notFound' | 'unavailable' | 'permission' | 'unknown';

function resultOf(e: unknown): ReaderActionResult {
  if (isPdfNativeError(e)) {
    switch (e.code) {
      case 'ERR_FILE_NOT_FOUND':
        return 'notFound';
      case 'ERR_VOLUME_UNAVAILABLE':
        return 'unavailable';
      case 'ERR_PERMISSION_DENIED':
        return 'permission';
    }
  }
  return 'unknown';
}

export async function runReaderAction(
  action: ReaderAction,
  input: { uri: string; title: string },
  native: Pick<PdfNativeApi, 'sharePdf' | 'printPdf' | 'openPdfWith'> = pdfNative,
): Promise<ReaderActionResult> {
  try {
    if (action === 'share') await native.sharePdf(input.uri, input.title);
    else if (action === 'print') await native.printPdf(input.uri, input.title);
    else await native.openPdfWith(input.uri, input.title);
    return 'ok';
  } catch (e) {
    return resultOf(e);
  }
}

type ToggleFn = (input: { fileId: string; page: number }) => { bookmarked: boolean };

const defaultToggle: ToggleFn = ({ fileId, page }) =>
  toggleBookmark(getDb(), { fileId, page, now: Date.now() });

/** Never throws: a removed file row (FK violation) or a bad page yields `{ ok: false }`. */
export function toggleReaderBookmark(
  input: { fileId: string; page: number; pageCount?: number },
  toggle: ToggleFn = defaultToggle,
): { ok: true; bookmarked: boolean } | { ok: false } {
  if (!Number.isInteger(input.page) || input.page < 1) return { ok: false };
  const page =
    input.pageCount !== undefined && Number.isInteger(input.pageCount)
      ? Math.min(input.page, input.pageCount)
      : input.page;
  if (page < 1) return { ok: false };
  try {
    return { ok: true, bookmarked: toggle({ fileId: input.fileId, page }).bookmarked };
  } catch {
    return { ok: false };
  }
}
