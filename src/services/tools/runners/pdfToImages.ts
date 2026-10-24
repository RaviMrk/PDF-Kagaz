import { throwIfCancelled } from '@/services/pdf/pdfErrors';

import { imageFileName, imageFolderName } from '../outputNames';
import type { PdfToolRequest, SavedImages } from '../runTool';
import { as, nativePageCounts, ToolRunFailure, type ToolRunner } from './context';

type PdfToImagesRequest = Extract<PdfToolRequest, { toolId: 'pdf-to-images' }>;

/** The gallery folder every PDF to images job saves under (one subfolder per input). */
export const PICTURES_ROOT = 'Pictures/PDFToolkit';

/**
 * PDF to images (always native): each chosen page of the staged (decrypted) input is rendered into
 * the workspace and saved to the gallery at once, so a cancel or failure keeps the images already
 * saved in `extras.images` (like split parts). The page renderer is released however the job ends.
 */
export const runPdfToImages: ToolRunner<PdfToImagesRequest> = async (ctx) => {
  const { request } = ctx;
  const { native } = ctx.deps;
  const input = ctx.inputs[0]!;
  const name = ctx.rows[0]!.name;
  const [pageCount] = await nativePageCounts(ctx, [0]);
  const pages = request.pages ?? Array.from({ length: pageCount! }, (_, i) => i + 1);
  if (pages.length === 0 || pages.some((p) => !Number.isInteger(p) || p < 1 || p > pageCount!)) {
    throw new ToolRunFailure('badPages', null);
  }
  const folder = imageFolderName(name, ctx.t);
  const images: SavedImages = {
    count: 0,
    folder: `${PICTURES_ROOT}/${folder}`,
    uris: [],
    reducedPages: 0,
  };
  const n = pages.length;
  ctx.setPages(n);
  try {
    for (const [i, page] of pages.entries()) {
      throwIfCancelled(ctx.signal);
      const rendered = await as(null, 0, () =>
        ctx.nativeOp(
          () =>
            ctx.time('embed', () =>
              native.renderPdfPage(input.uri, ctx.jobId, page, request.dpi, request.format),
            ),
          { from: i / n, to: (i + 1) / n },
        ),
      );
      const fileName = imageFileName(name, page, pageCount!, request.format, ctx.t);
      // A save once started is never interrupted (like publishing a PDF).
      const saved = await as(null, null, () =>
        ctx.time('publish', () => native.publishImageOutput(rendered.uri, fileName, folder)),
      );
      images.count += 1;
      images.uris.push(saved.uri);
      if (rendered.reduced) images.reducedPages += 1;
      ctx.setExtras({ images: { ...images, uris: [...images.uris] } });
      ctx.processing((i + 1) / n);
    }
  } finally {
    try {
      await native.releasePageExport();
    } catch {
      // Released again by the next export; the workspace is deleted all the same.
    }
  }
};
