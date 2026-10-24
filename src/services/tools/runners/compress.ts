import { compressedName } from '../outputNames';
import type { PdfToolRequest } from '../runTool';
import { knownSize } from '../toolFailure';
import { as, ToolRunFailure, type ToolRunner } from './context';

type CompressRequest = Extract<PdfToolRequest, { toolId: 'compress' }>;

/**
 * Compress (always native): the staged (decrypted) input's images are re-encoded at the chosen
 * level and the copy is published, even when it is not smaller (the result screen says so and
 * offers to delete it). The sizes compare the original (its staged size when the row has none)
 * with the new file.
 */
export const runCompress: ToolRunner<CompressRequest> = async (ctx) => {
  const input = ctx.inputs[0]!;
  const result = await as(null, 0, () =>
    ctx.nativeOp(() =>
      ctx.time('embed', () => ctx.deps.native.compressPdf(input.uri, ctx.jobId, ctx.request.level)),
    ),
  );
  if (!Number.isFinite(result.sizeBytes) || result.sizeBytes < 0) {
    throw new ToolRunFailure('unknown', null);
  }
  await ctx.publishFile(result, compressedName(ctx.rows[0]!.name, ctx.t), 0, 1);
  const rowSize = knownSize(ctx.rows[0]!.sizeBytes);
  ctx.setExtras({
    sizes: { before: rowSize > 0 ? rowSize : input.sizeBytes, after: result.sizeBytes },
  });
};
