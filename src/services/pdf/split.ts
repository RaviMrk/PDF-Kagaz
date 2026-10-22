import { PDFDocument } from '@cantoo/pdf-lib';

import { loadPdf } from './loadPdf';
import { PdfToolError, throwIfCancelled, type RunControl } from './pdfErrors';

/** Writes one document per group of 1-based pages; returns the number of parts. */
export async function splitPdf(
  bytes: Uint8Array,
  groups: number[][],
  control: RunControl & { onPart(index: number, bytes: Uint8Array): Promise<void> },
): Promise<number> {
  if (groups.length === 0) throw new PdfToolError('empty');
  const { onProgress, onPart, signal } = control;
  throwIfCancelled(signal);
  const source = await loadPdf(bytes);
  const pageCount = source.getPageCount();
  for (const group of groups) {
    if (group.length === 0 || group.some((p) => !Number.isInteger(p) || p < 1 || p > pageCount)) {
      throw new PdfToolError('badPages');
    }
  }
  for (const [i, group] of groups.entries()) {
    throwIfCancelled(signal);
    const part = await PDFDocument.create({ updateMetadata: false });
    const pages = await part.copyPages(
      source,
      group.map((p) => p - 1),
    );
    for (const page of pages) part.addPage(page);
    await onPart(i, await part.save({ useObjectStreams: true }));
    onProgress?.((i + 1) / groups.length);
  }
  return groups.length;
}
