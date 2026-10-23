import { PDFDocument } from '@cantoo/pdf-lib';

import { placeImage, type ImageLayoutOptions } from './imageLayout';
import { PdfToolError, throwIfCancelled, type RunControl } from './pdfErrors';

/** Builds one page per image; JPEG bytes are embedded as-is, one image in memory at a time. */
export async function imagesToPdf(
  images: readonly (() => Promise<Uint8Array>)[],
  layout: ImageLayoutOptions,
  control: RunControl = {},
): Promise<Uint8Array> {
  if (images.length === 0) throw new PdfToolError('empty');
  const { onProgress, signal } = control;
  const n = images.length;
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setProducer('PDF Toolkit');
  doc.setCreator('PDF Toolkit');
  for (const [i, load] of images.entries()) {
    throwIfCancelled(signal);
    try {
      const image = await doc.embedJpg(await load());
      const p = placeImage(image.width, image.height, layout);
      const page = doc.addPage([p.pageWidth, p.pageHeight]);
      page.drawImage(image, { x: p.x, y: p.y, width: p.width, height: p.height });
    } catch (e) {
      if (e instanceof PdfToolError && e.kind === 'cancelled') throw e;
      // A load that failed because the job was cancelled is a cancel, not a damaged image.
      throwIfCancelled(signal);
      throw new PdfToolError('invalid', i);
    }
    onProgress?.((i + 1) / (n + 1));
  }
  throwIfCancelled(signal);
  const bytes = await doc.save({ useObjectStreams: true });
  onProgress?.(1);
  return bytes;
}
