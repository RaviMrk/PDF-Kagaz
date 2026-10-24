import { numberedName } from '../outputNames';
import type { PdfToolRequest } from '../runTool';
import { pageNumberSpec } from '../stampSpecs';
import type { ToolRunner } from './context';
import { runStamps } from './stampRoute';

type PageNumbersRequest = Extract<PdfToolRequest, { toolId: 'page-numbers' }>;

/** Add page numbers: Helvetica text from the localised template on the chosen pages. */
export const runPageNumbers: ToolRunner<PageNumbersRequest> = async (ctx) => {
  const { numbers } = ctx.request;
  const template = ctx.t(numbers.format === 'n' ? 'numbers.templateN' : 'numbers.templateOf');
  await runStamps(ctx, pageNumberSpec(numbers, template), numberedName(ctx.rows[0]!.name, ctx.t));
};
