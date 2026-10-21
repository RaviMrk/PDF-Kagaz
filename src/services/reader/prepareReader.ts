import { isPdfNativeError, pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';

import type { ReaderFailure } from './readerState';

export function failureOf(e: unknown): ReaderFailure {
  if (isPdfNativeError(e)) {
    switch (e.code) {
      case 'ERR_FILE_NOT_FOUND':
        return 'notFound';
      case 'ERR_VOLUME_UNAVAILABLE':
        return 'unavailable';
      case 'ERR_PERMISSION_DENIED':
        return 'permission';
      case 'ERR_PDF_INVALID':
        return 'invalid';
      case 'ERR_IO':
        return 'io';
    }
  }
  return 'unknown';
}

/** Only a confirmed missing file may drop its row; unavailable volumes, I/O and permission keep it. */
export function shouldDropMissing(reason: ReaderFailure): boolean {
  return reason === 'notFound';
}

export async function openReaderFile(
  uri: string,
  native: Pick<PdfNativeApi, 'prepareReaderFile'> = pdfNative,
): Promise<{ ok: true; fileUri: string } | { ok: false; reason: ReaderFailure }> {
  try {
    const file = await native.prepareReaderFile(uri);
    return { ok: true, fileUri: file.uri };
  } catch (e) {
    return { ok: false, reason: failureOf(e) };
  }
}

export function closeReader(native: Pick<PdfNativeApi, 'releaseReaderDocument'> = pdfNative): void {
  try {
    native.releaseReaderDocument().catch(() => undefined);
  } catch {
    // Fire-and-forget.
  }
}
