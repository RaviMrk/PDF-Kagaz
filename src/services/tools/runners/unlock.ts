import { unlockedName } from '../outputNames';
import type { PdfToolRequest } from '../runTool';
import { ToolRunFailure, type ToolRunner } from './context';

type UnlockRequest = Extract<PdfToolRequest, { toolId: 'unlock' }>;

/**
 * Remove password: `unlockInputs` already wrote the decrypted copy of a locked input, which is
 * published under the unlocked name. An input that had no encryption has nothing to remove.
 */
export const runUnlock: ToolRunner<UnlockRequest> = async (ctx) => {
  if (ctx.locks[0] === 'none') throw new ToolRunFailure('notProtected', 0);
  await ctx.publishFile(ctx.inputs[0]!, unlockedName(ctx.rows[0]!.name, ctx.t), 0, 1);
};
