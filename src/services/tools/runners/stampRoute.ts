import { applyStamps, type StampSpec } from '@/services/pdf/stamp';

import { as, readInput, ToolRunFailure, type RunContext } from './context';

/**
 * Stamps staged input 0 with `spec` and publishes it as `name`: in pdf-lib on the JS route (the
 * workspace PNGs read on demand), otherwise with PdfBox, which writes the stamped copy itself.
 */
export async function runStamps(ctx: RunContext, spec: StampSpec, name: string): Promise<void> {
  const input = ctx.inputs[0]!;
  if (ctx.route === 'native') {
    const file = await as(null, 0, () =>
      ctx.nativeOp(() =>
        ctx.time('embed', () =>
          ctx.deps.native.stampPdf(input.uri, ctx.jobId, JSON.stringify(spec)),
        ),
      ),
    );
    if (!Number.isFinite(file.sizeBytes) || file.sizeBytes < 0) {
      throw new ToolRunFailure('unknown', null);
    }
    await ctx.publishFile(file, name, 0, 1);
    return;
  }
  const source = await readInput(ctx, 0);
  const readPng = (uri: string) =>
    as('io', null, () => ctx.time('read', () => ctx.deps.fs.readBytes(uri)));
  const bytes = await ctx.time('embed', () =>
    applyStamps(source, spec, readPng, { signal: ctx.signal, onProgress: ctx.processing }),
  );
  await ctx.save({ bytes, name }, 0, 1);
}
