import { throwIfCancelled } from '@/services/pdf/pdfErrors';

import { signedName } from '../outputNames';
import { MAX_PLACEMENTS } from '../placement';
import type { PdfToolRequest } from '../runTool';
import { signatureSpec } from '../stampSpecs';
import { as, ToolRunFailure, type RunContext, type ToolRunner } from './context';
import { runStamps } from './stampRoute';

type SignRequest = Extract<PdfToolRequest, { toolId: 'sign' }>;

/**
 * Copies each placed signature's saved PNG into the job workspace once (PdfStamper only takes PNGs
 * of the job's own workspace; pdf-lib reads them from there too). A signature whose row or file is
 * gone fails as `signatureGone`. Returns signature id → workspace PNG.
 */
async function stageSignatures(ctx: RunContext<SignRequest>): Promise<Map<number, string>> {
  const { fs } = ctx.deps;
  const pngs = new Map<number, string>();
  for (const { signatureId } of ctx.request.placements) {
    if (pngs.has(signatureId)) continue;
    throwIfCancelled(ctx.signal);
    const saved = ctx.deps.getSignaturePng(signatureId);
    if (saved === null) throw new ToolRunFailure('signatureGone', null);
    const bytes = await as('signatureGone', null, () =>
      ctx.time('prepare', () => fs.readBytes(saved)),
    );
    const copy = `${ctx.workspace}/signature-${pngs.size + 1}.png`;
    await as('io', null, () => ctx.time('prepare', () => fs.writeBytes(copy, bytes)));
    pngs.set(signatureId, copy);
  }
  return pngs;
}

/** Sign PDF: each placement stamps its saved signature, opaque and upright, on its page. */
export const runSign: ToolRunner<SignRequest> = async (ctx) => {
  const { placements } = ctx.request;
  if (placements.length < 1 || placements.length > MAX_PLACEMENTS) {
    throw new ToolRunFailure('badPages', null);
  }
  const pngs = await stageSignatures(ctx);
  throwIfCancelled(ctx.signal);
  const spec = signatureSpec(placements, (id) => pngs.get(id)!);
  await runStamps(ctx, spec, signedName(ctx.rows[0]!.name, ctx.t));
};
