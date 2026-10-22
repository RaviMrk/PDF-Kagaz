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
