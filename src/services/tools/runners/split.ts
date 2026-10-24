import { loadPdf } from '@/services/pdf/loadPdf';
import { PdfToolError } from '@/services/pdf/pdfErrors';
import { splitPdf } from '@/services/pdf/split';
import { everyNGroups, parsePageRanges, uniqueSortedPages } from '@/utils/pageRanges';

import { splitNames } from '../outputNames';
import type { SplitOptions, SplitRequest } from '../runTool';
import { assembleNative, nativePageCounts, readInput, type ToolRunner } from './context';

/** Split: each page group becomes its own PDF, published as soon as it is written. */
export const runSplit: ToolRunner<SplitRequest> = async (ctx) => {
  const { request } = ctx;
  if (ctx.route === 'native') {
    const [pageCount] = await nativePageCounts(ctx, [0]);
    const groups = splitGroups(request.split, pageCount!);
    const names = splitNames(ctx.rows[0]!.name, request.split.mode, groups, ctx.t);
    ctx.setPages(groups.reduce((n, g) => n + g.length, 0));
    const parts = await assembleNative(
      ctx,
      groups.map((g) => g.map((page) => ({ i: 0, p: page - 1, r: 0 }))),
    );
    for (const [i, part] of parts.entries()) {
      await ctx.publishFile(part, names[i]!, i / parts.length, (i + 1) / parts.length);
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
