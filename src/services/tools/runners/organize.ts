import { organizePdf } from '@/services/pdf/organize';

import { organisedName } from '../outputNames';
import type { OrganizeRequest } from '../runTool';
import { readInput, requireJsRoute, type ToolRunner } from './context';

/** Organize: the requested pages (order, rotation, duplicates) into one new PDF. */
export const runOrganize: ToolRunner<OrganizeRequest> = async (ctx) => {
  requireJsRoute(ctx);
  const { request } = ctx;
  const source = await readInput(ctx, 0);
  const bytes = await ctx.time('embed', () =>
    organizePdf(source, request.pages, { signal: ctx.signal, onProgress: ctx.processing }),
  );
  ctx.setPages(request.pages.length);
  await ctx.save({ bytes, name: organisedName(ctx.rows[0]!.name, ctx.t) }, 0, 1);
};
