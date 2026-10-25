import type { FileRow } from '@/db/schema';
import { isPdfNativeError, pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';

import { routeFor } from './limits';
import { knownSize, toToolFailure } from './toolFailure';
import type { ToolFailure } from './toolJobRepo';
import type { RunnableToolId } from './toolRegistry';

/** An input that needs a password before a tool can use it (its index among the tool's inputs). */
export type LockedInput = { index: number; lock: 'password' | 'restricted' };

/** An input that cannot be used at all (damaged or gone): no password can help. */
export type BlockedInput = { index: number; failure: ToolFailure };

/**
 * The inputs that need a password, in order, and those that are blocked. An input that opens with
 * the empty password is not locked (the job decrypts it silently). One that cannot be inspected is blocked when it is damaged or gone,
 * except that a routed tool (pdf-lib, under the JS caps) is left to the job for a damaged one,
 * since pdf-lib may open what PdfBox rejects; any other inspect error asks for the password and
 * lets the check tell what is wrong.
 */
export async function findLockedInputs(
  rows: FileRow[],
  native: Pick<PdfNativeApi, 'inspectPdf'> = pdfNative,
  toolId?: RunnableToolId,
): Promise<{ locked: LockedInput[]; blocked: BlockedInput[] }> {
  const locked: LockedInput[] = [];
  const blocked: BlockedInput[] = [];
  const jsRoute =
    toolId !== undefined &&
    routeFor(
      toolId,
      rows.map((r) => knownSize(r.sizeBytes)),
    ) === 'js';
  for (const [index, row] of rows.entries()) {
    let lock: 'none' | 'open' | 'password' | 'restricted';
    try {
      lock = await native.inspectPdf(row.uri);
    } catch (e) {
      if (isPdfNativeError(e, 'ERR_FILE_NOT_FOUND')) {
        blocked.push({ index, failure: toToolFailure(e) });
      } else if (isPdfNativeError(e, 'ERR_PDF_INVALID')) {
        if (!jsRoute) blocked.push({ index, failure: toToolFailure(e) });
      } else {
        locked.push({ index, lock: 'password' });
      }
      continue;
    }
    if (lock === 'restricted') locked.push({ index, lock });
    else if (lock === 'password') locked.push({ index, lock: 'password' });
  }
  return { locked, blocked };
}
