import { degrees, PDFDocument } from '@cantoo/pdf-lib';

import { loadPdf } from './loadPdf';
import { PdfToolError, throwIfCancelled, type RunControl } from './pdfErrors';

export type PageRotation = 0 | 90 | 180 | 270;
export type PageEdit = { source: number; rotate: PageRotation };

/** Builds a document from `pages` (1-based sources): reorder, delete, duplicate, rotate. */
export async function organizePdf(
  bytes: Uint8Array,
  pages: readonly PageEdit[],
  control: RunControl = {},
): Promise<Uint8Array> {
  if (pages.length === 0) throw new PdfToolError('empty');
  const { onProgress, signal } = control;
  throwIfCancelled(signal);
  const source = await loadPdf(bytes);
  const pageCount = source.getPageCount();
  if (pages.some((p) => !Number.isInteger(p.source) || p.source < 1 || p.source > pageCount)) {
    throw new PdfToolError('badPages');
  }
  const out = await PDFDocument.create({ updateMetadata: false });
  const copies = await out.copyPages(
    source,
    pages.map((p) => p.source - 1),
  );
  copies.forEach((page, k) => {
    const rotate = pages[k]?.rotate ?? 0;
    const rotation = (((page.getRotation().angle + rotate) % 360) + 360) % 360;
    page.setRotation(degrees(rotation));
    out.addPage(page);
  });
  onProgress?.(0.5);
  throwIfCancelled(signal);
  const result = await out.save({ useObjectStreams: true });
  onProgress?.(1);
  return result;
}
