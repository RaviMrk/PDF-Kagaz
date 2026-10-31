import { searchableName } from '../outputNames';
import type { PdfToolRequest } from '../runTool';
import { as, ToolRunFailure, type ToolRunner } from './context';

type OcrRequest = Extract<PdfToolRequest, { toolId: 'ocr' }>;

/**
 * Make searchable (always native): the staged (decrypted) input gets an invisible text layer on
 * its scanned pages. Nothing is published when every page already had text or no words were found.
 */
export const runOcr: ToolRunner<OcrRequest> = async (ctx) => {
  const input = ctx.inputs[0]!;
  const result = await as(null, 0, () =>
    ctx.nativeOp(() => ctx.time('embed', () => ctx.deps.native.ocrPdf(input.uri, ctx.jobId))),
  );
  if (result.uri === null) {
    throw new ToolRunFailure(
      result.pagesSkipped >= result.pageCount ? 'alreadySearchable' : 'noTextFound',
      null,
    );
  }
  if (!Number.isFinite(result.sizeBytes) || result.sizeBytes < 0) {
    throw new ToolRunFailure('unknown', null);
  }
  await ctx.publishFile(
    { uri: result.uri, sizeBytes: result.sizeBytes },
    searchableName(ctx.rows[0]!.name, ctx.t),
    0,
    1,
  );
  ctx.setExtras({
    ocr: {
      pagesWithText: result.pagesWithText,
      pagesSkipped: result.pagesSkipped,
      pagesNoText: result.pagesRecognized - result.pagesWithText,
    },
  });
};
