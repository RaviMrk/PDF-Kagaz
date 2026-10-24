import { isPdfNativeError, pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';

/** How a share or open of saved gallery images went (codes only, never names or uris). */
export type ImageActionResult = 'ok' | 'notFound' | 'permission' | 'unknown';

function resultOf(e: unknown): ImageActionResult {
  if (isPdfNativeError(e, 'ERR_FILE_NOT_FOUND')) return 'notFound';
  if (isPdfNativeError(e, 'ERR_PERMISSION_DENIED')) return 'permission';
  return 'unknown';
}

/** Share sheet for the images PDF to images saved; no images is `notFound`. */
export async function shareSavedImages(
  uris: readonly string[],
  chooserTitle: string,
  native: Pick<PdfNativeApi, 'shareImages'> = pdfNative,
): Promise<ImageActionResult> {
  if (uris.length === 0) return 'notFound';
  try {
    await native.shareImages([...uris], chooserTitle);
    return 'ok';
  } catch (e) {
    return resultOf(e);
  }
}

/** Opens one saved image in a viewer app. */
export async function viewSavedImage(
  uri: string,
  chooserTitle: string,
  native: Pick<PdfNativeApi, 'viewImage'> = pdfNative,
): Promise<ImageActionResult> {
  try {
    await native.viewImage(uri, chooserTitle);
    return 'ok';
  } catch (e) {
    return resultOf(e);
  }
}
