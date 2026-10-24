import { displayName } from '@/utils/displayName';
import { formatBytes } from '@/utils/fileSize';

import { capsFor, NATIVE_CAPS, type Caps } from './limits';
import type { Translate } from './outputNames';
import type { ToolFailure } from './toolJobRepo';
import type { RunnableToolId } from './toolRegistry';

/** Failures with a `toolError.<failure>Named` copy in en.json. */
const NAMED: ReadonlySet<ToolFailure> = new Set([
  'notFound',
  'unavailable',
  'permission',
  'encrypted',
  'invalid',
  'tooLarge',
]);

/**
 * User-facing copy for a tool failure, naming the input file when the copy allows it. Size
 * failures give the limit from `caps` (default: the PDF tools' native caps).
 */
export function failureMessage(
  failure: ToolFailure,
  inputName: string | null,
  t: Translate,
  caps: Caps = NATIVE_CAPS,
): string {
  const limit =
    failure === 'tooLarge'
      ? formatBytes(caps.file)
      : failure === 'totalTooLarge'
        ? formatBytes(caps.total)
        : undefined;
  const params = limit === undefined ? {} : { limit };
  if (inputName !== null && NAMED.has(failure)) {
    return t(`toolError.${failure}Named`, { ...params, name: displayName(inputName) });
  }
  return t(`toolError.${failure}`, params);
}

/**
 * Copy for a finished job's failure: an interrupted job that saved files says so, and an image or
 * scan job over the size cap gets images copy instead of the merge copy.
 */
export function jobFailureMessage(
  failure: ToolFailure,
  inputName: string | null,
  savedCount: number,
  t: Translate,
  toolId: RunnableToolId,
): string {
  if (failure === 'interrupted' && savedCount > 0) return t('toolError.interruptedPartial');
  if (failure === 'totalTooLarge' && (toolId === 'images-to-pdf' || toolId === 'scan')) {
    return t('toolError.imagesTooLarge');
  }
  return failureMessage(failure, inputName, t, capsFor(toolId));
}
