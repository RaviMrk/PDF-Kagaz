import { PDFDocument } from '@cantoo/pdf-lib';

import { loadPdf } from './loadPdf';
import { PdfToolError, throwIfCancelled, type RunControl } from './pdfErrors';

/** Merges sources in order; each source is loaded, copied and dropped before the next. */
export async function mergePdfs(
  sources: readonly (() => Promise<Uint8Array>)[],
  control: RunControl & { onPageCount?: (count: number) => void } = {},
): Promise<Uint8Array> {
  if (sources.length < 2) throw new PdfToolError('empty');
  const { onProgress, onPageCount, signal } = control;
  const n = sources.length;
  const out = await PDFDocument.create({ updateMetadata: false });
  for (const [i, load] of sources.entries()) {
    throwIfCancelled(signal);
    const doc = await loadPdf(await load(), i);
    const pages = await out.copyPages(
      doc,
      Array.from({ length: doc.getPageCount() }, (_, k) => k),
    );
    for (const page of pages) out.addPage(page);
    onProgress?.((i + 1) / (n + 1));
  }
  throwIfCancelled(signal);
  onPageCount?.(out.getPageCount());
  const bytes = await out.save({ useObjectStreams: true });
  onProgress?.(1);
  return bytes;
}
