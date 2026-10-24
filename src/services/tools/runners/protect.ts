import { protectedName } from '../outputNames';
import type { PdfToolRequest } from '../runTool';
import { as, ToolRunFailure, type ToolRunner } from './context';

type ProtectRequest = Extract<PdfToolRequest, { toolId: 'protect' }>;

/**
 * Protect (always native): the staged input, already decrypted by `unlockInputs` when it was
 * locked, is written with the new AES-256 password and the copy is published. The password stays
 * in the request and this call: never logged or stored.
 */
export const runProtect: ToolRunner<ProtectRequest> = async (ctx) => {
  const input = ctx.inputs[0]!;
  const result = await as(null, 0, () =>
    ctx.nativeOp(() =>
      ctx.time('embed', () =>
        ctx.deps.native.protectPdf(input.uri, ctx.jobId, ctx.request.newPassword),
      ),
    ),
  );
  if (!Number.isFinite(result.sizeBytes) || result.sizeBytes < 0) {
    throw new ToolRunFailure('unknown', null);
  }
  await ctx.publishFile(result, protectedName(ctx.rows[0]!.name, ctx.t), 0, 1);
};
