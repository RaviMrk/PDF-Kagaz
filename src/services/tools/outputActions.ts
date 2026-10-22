import type { FileRow } from '@/db/schema';
import { isPdfNativeError, pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';
import { displayName } from '@/utils/displayName';

export type SaveCopyResult =
  'saved' | 'cancelled' | 'exists' | 'notFound' | 'permission' | 'unknown';

/** Copies a tool output to a place the user picks. A non-empty target is `exists`; anything else unexpected is `unknown`. */
export async function saveOutputCopy(
  row: FileRow,
  native: Pick<PdfNativeApi, 'saveCopyAs'> = pdfNative,
): Promise<SaveCopyResult> {
  try {
    return (await native.saveCopyAs(row.uri, displayName(row.name))) ? 'saved' : 'cancelled';
  } catch (e) {
    if (isPdfNativeError(e, 'ERR_FILE_EXISTS')) return 'exists';
    if (isPdfNativeError(e, 'ERR_FILE_NOT_FOUND')) return 'notFound';
    if (isPdfNativeError(e, 'ERR_PERMISSION_DENIED')) return 'permission';
    return 'unknown';
  }
}
