import { mergePdfs } from '@/services/pdf/merge';

import { mergedName } from '../outputNames';
import type { MergeRequest } from '../runTool';
import { assembleNative, nativePageCounts, readInput, type ToolRunner } from './context';

/** Merge: every staged input in order into one PDF, named after the first input. */
export const runMerge: ToolRunner<MergeRequest> = async (ctx) => {
  const name = mergedName(ctx.rows[0]!.name, ctx.t);
  if (ctx.route === 'native') {
    const counts = await nativePageCounts(
      ctx,
      ctx.inputs.map((_, i) => i),
    );
    const refs = counts.flatMap((n, i) => Array.from({ length: n }, (_, p) => ({ i, p, r: 0 })));
    ctx.setPages(refs.length);
    const [merged] = await assembleNative(ctx, [refs]);
    await ctx.publishFile(merged!, name, 0, 1);
    return;
  }
  const sources = ctx.inputs.map((_, i) => () => readInput(ctx, i));
  const bytes = await ctx.time('embed', () =>
    mergePdfs(sources, {
      signal: ctx.signal,
      onProgress: ctx.processing,
      onPageCount: ctx.setPages,
    }),
  );
  await ctx.save({ bytes, name }, 0, 1);
};
