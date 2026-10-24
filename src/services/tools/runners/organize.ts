import { organizePdf, type PageEdit } from '@/services/pdf/organize';
import { PdfToolError } from '@/services/pdf/pdfErrors';

import { organisedName } from '../outputNames';
import type { OrganizeRequest } from '../runTool';
import { assembleNative, readInput, type PageRef, type ToolRunner } from './context';

/** Organize: the requested pages (order, rotation, duplicates) into one new PDF. */
export const runOrganize: ToolRunner<OrganizeRequest> = async (ctx) => {
  const { request } = ctx;
  const name = organisedName(ctx.rows[0]!.name, ctx.t);
  if (ctx.route === 'native') {
    // PdfBox refuses a page past the end; the rest is checked here, as on the JS path.
    const refs = toPageRefs(request.pages);
    ctx.setPages(refs.length);
    const [organised] = await assembleNative(ctx, [refs]);
    await ctx.publishFile(organised!, name, 0, 1);
    return;
  }
  const source = await readInput(ctx, 0);
  const bytes = await ctx.time('embed', () =>
    organizePdf(source, request.pages, { signal: ctx.signal, onProgress: ctx.processing }),
  );
  ctx.setPages(request.pages.length);
  await ctx.save({ bytes, name }, 0, 1);
};

/** 1-based page edits of input 0 → native refs; none → empty, a bad source or rotation → badPages. */
function toPageRefs(pages: readonly PageEdit[]): PageRef[] {
  if (pages.length === 0) throw new PdfToolError('empty');
  return pages.map(({ source, rotate }) => {
    if (!Number.isInteger(source) || source < 1 || ![0, 90, 180, 270].includes(rotate)) {
      throw new PdfToolError('badPages');
    }
    return { i: 0, p: source - 1, r: rotate };
  });
}
