import type { FileRow } from '@/db/schema';
import {
  isPdfNativeError,
  pdfNative,
  type PdfFileInfo,
  type PdfNativeApi,
} from '@/services/native/pdfNative';
import { useFiles } from '@/stores/filesStore';

export type IncomingResult =
  { ok: true; id: string } | { ok: false; reason: 'notFound' | 'permission' | 'unknown' };

/** Resolves a PDF handed to the app and stores it as a file row; never throws. */
export async function openIncomingPdf(
  uri: string,
  deps: {
    native: Pick<PdfNativeApi, 'resolveIncomingPdf'>;
    register: (info: PdfFileInfo) => FileRow | null;
  } = { native: pdfNative, register: (i) => useFiles.getState().registerIncoming(i) },
): Promise<IncomingResult> {
  try {
    const row = deps.register(await deps.native.resolveIncomingPdf(uri));
    return row ? { ok: true, id: row.id } : { ok: false, reason: 'unknown' };
  } catch (e) {
    if (isPdfNativeError(e, 'ERR_PERMISSION_DENIED')) return { ok: false, reason: 'permission' };
    if (isPdfNativeError(e, 'ERR_FILE_NOT_FOUND')) return { ok: false, reason: 'notFound' };
    return { ok: false, reason: 'unknown' };
  }
}
