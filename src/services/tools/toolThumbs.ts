import { pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';
import { createPageThumbLoader, type PageThumbLoader } from '@/services/reader/pageThumbLoader';

/** Page thumbnails of a staged tool file, on the tool thumbnail lane. */
export function createToolThumbLoader(
  fileUri: string,
  width: number,
  native: Pick<PdfNativeApi, 'renderToolThumbnail'> = pdfNative,
): PageThumbLoader {
  return createPageThumbLoader({
    fileUri,
    width,
    native: { renderReaderThumbnail: (uri, page, w) => native.renderToolThumbnail(uri, page, w) },
  });
}
