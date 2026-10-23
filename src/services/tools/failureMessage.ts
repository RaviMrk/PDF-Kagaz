import { displayName } from '@/utils/displayName';

import type { Translate } from './outputNames';
import type { ToolFailure } from './toolJobRepo';

/** Failures with a `toolError.<failure>Named` copy in en.json. */
const NAMED: ReadonlySet<ToolFailure> = new Set([
  'notFound',
  'unavailable',
  'permission',
  'encrypted',
  'invalid',
  'tooLarge',
]);

/** User-facing copy for a tool failure, naming the input file when the copy allows it. */
export function failureMessage(
  failure: ToolFailure,
  inputName: string | null,
  t: Translate,
): string {
  if (inputName !== null && NAMED.has(failure)) {
    return t(`toolError.${failure}Named`, { name: displayName(inputName) });
  }
  return t(`toolError.${failure}`);
}

/** Copy for a finished job's failure: an interrupted job that saved files says so. */
export function jobFailureMessage(
  failure: ToolFailure,
  inputName: string | null,
  savedCount: number,
  t: Translate,
): string {
  if (failure === 'interrupted' && savedCount > 0) return t('toolError.interruptedPartial');
  return failureMessage(failure, inputName, t);
}
