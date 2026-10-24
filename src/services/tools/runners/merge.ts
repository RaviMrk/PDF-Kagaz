import { mergePdfs } from '@/services/pdf/merge';

import { mergedName } from '../outputNames';
import type { MergeRequest } from '../runTool';
import { readInput, requireJsRoute, type ToolRunner } from './context';

/** Merge: every staged input in order into one PDF, named after the first input. */
export const runMerge: ToolRunner<MergeRequest> = async (ctx) => {
  requireJsRoute(ctx);
  const sources = ctx.inputs.map((_, i) => () => readInput(ctx, i));
  const bytes = await ctx.time('embed', () =>
    mergePdfs(sources, {
      signal: ctx.signal,
      onProgress: ctx.processing,
      onPageCount: ctx.setPages,
    }),
  );
  await ctx.save({ bytes, name: mergedName(ctx.rows[0]!.name, ctx.t) }, 0, 1);
};
