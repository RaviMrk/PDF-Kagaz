import { loadPdf } from '@/services/pdf/loadPdf';
import { PdfToolError } from '@/services/pdf/pdfErrors';
import { splitPdf } from '@/services/pdf/split';
import { everyNGroups, parsePageRanges, uniqueSortedPages } from '@/utils/pageRanges';

import { splitNames } from '../outputNames';
import type { SplitOptions, SplitRequest } from '../runTool';
import { assembleNative, nativePageCounts, readInput, type ToolRunner } from './context';

/** At most this many assemblePdf calls per native split… */
export const NATIVE_SPLIT_BATCHES = 8;
/** …of at least this many parts each (a short split is one call). */
export const NATIVE_SPLIT_MIN_BATCH = 3;

/** Split: each page group becomes its own PDF, published as soon as it is written. */
export const runSplit: ToolRunner<SplitRequest> = async (ctx) => {
  const { request } = ctx;
  if (ctx.route === 'native') {
    const [pageCount] = await nativePageCounts(ctx, [0]);
    const groups = splitGroups(request.split, pageCount!);
    const names = splitNames(ctx.rows[0]!.name, request.split.mode, groups, ctx.t);
    ctx.setPages(groups.reduce((n, g) => n + g.length, 0));
    const outputs = groups.map((g) => g.map((page) => ({ i: 0, p: page - 1, r: 0 })));
    // A few batches: each is published (publishing removes its workspace copies) before the next
    // starts, so a cancel or failure keeps the parts already published, like the JS path, and the
    // workspace holds about one batch of parts; the inputs are reopened once per batch.
    const size = Math.max(NATIVE_SPLIT_MIN_BATCH, Math.ceil(outputs.length / NATIVE_SPLIT_BATCHES));
    const batches = Math.ceil(outputs.length / size);
    for (let b = 0; b < batches; b++) {
      const start = b * size;
      const parts = await assembleNative(ctx, outputs.slice(start, start + size), start + 1, {
        from: b / batches,
        to: (b + 1) / batches,
      });
      for (const [j, part] of parts.entries()) {
        const k = start + j;
        await ctx.publishFile(part, names[k]!, k / outputs.length, (k + 1) / outputs.length);
      }
    }
    return;
  }
  const bytes = await readInput(ctx, 0);
  const pageCount = await ctx.time('embed', async () => (await loadPdf(bytes, 0)).getPageCount());
  const groups = splitGroups(request.split, pageCount);
  const names = splitNames(ctx.rows[0]!.name, request.split.mode, groups, ctx.t);
  ctx.setPages(groups.reduce((n, g) => n + g.length, 0));
  // Each part's write and publish are timed as save / publish, not as pdf-lib work.
  await ctx.time('embed', () =>
    splitPdf(bytes, groups, {
      signal: ctx.signal,
      onProgress: ctx.processing,
      onPart: (i, part) =>
        ctx.save({ bytes: part, name: names[i]! }, i / groups.length, (i + 1) / groups.length),
    }),
  );
};

function splitGroups(split: SplitOptions, pageCount: number): number[][] {
  if (split.mode === 'everyN') {
    const groups = everyNGroups(pageCount, split.n);
    if (groups.length === 0) throw new PdfToolError('badPages');
    return groups;
  }
  const parsed = parsePageRanges(split.ranges, pageCount);
  if (!parsed.ok) throw new PdfToolError('badPages');
  return split.mode === 'extract' ? [uniqueSortedPages(parsed.groups)] : parsed.groups;
}
