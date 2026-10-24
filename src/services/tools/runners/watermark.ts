import { isPdfNativeError, type PreparedPage } from '@/services/native/pdfNative';
import { throwIfCancelled } from '@/services/pdf/pdfErrors';

import { watermarkedName } from '../outputNames';
import type { PdfToolRequest } from '../runTool';
import { WATERMARK_COLORS, watermarkSpec } from '../stampSpecs';
import { toToolFailure } from '../toolFailure';
import { as, ToolRunFailure, type RunContext, type ToolRunner } from './context';
import { runStamps } from './stampRoute';

type WatermarkRequest = Extract<PdfToolRequest, { toolId: 'watermark' }>;

/** Text watermark PNG height; image watermarks are prepared at this long side at most. */
const TEXT_STAMP_HEIGHT_PX = 256;
const IMAGE_STAMP_LONG_SIDE_PX = 1600;

/** The watermark as a transparent PNG in the job workspace (text rendered natively, any script). */
async function stampPng(ctx: RunContext<WatermarkRequest>): Promise<PreparedPage> {
  const { source } = ctx.request.watermark;
  const { native } = ctx.deps;
  if (source.kind === 'text') {
    return as(null, null, () =>
      ctx.time('prepare', () =>
        native.renderTextStamp(
          ctx.jobId,
          source.text,
          WATERMARK_COLORS[source.color],
          TEXT_STAMP_HEIGHT_PX,
        ),
      ),
    );
  }
  try {
    return await ctx.time('prepare', () =>
      native.prepareStampImage(source.sessionId, source.index, ctx.jobId, IMAGE_STAMP_LONG_SIDE_PX),
    );
  } catch (e) {
    throwIfCancelled(ctx.signal);
    // The session was deleted (cleaned up at another start): the image must be chosen again.
    if (isPdfNativeError(e, 'ERR_FILE_NOT_FOUND')) throw new ToolRunFailure('imagesGone', null);
    throw new ToolRunFailure(toToolFailure(e), null);
  }
}

/** Add watermark: one image stamp (the text rendered to a PNG first) on the chosen pages. */
export const runWatermark: ToolRunner<WatermarkRequest> = async (ctx) => {
  const png = await stampPng(ctx);
  throwIfCancelled(ctx.signal);
  const spec = watermarkSpec(ctx.request.watermark, png.uri);
  await runStamps(ctx, spec, watermarkedName(ctx.rows[0]!.name, ctx.t));
};
