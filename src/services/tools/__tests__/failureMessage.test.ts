/** @jest-environment node */
import { initI18n } from '@/i18n';

import { failureMessage } from '../failureMessage';

const i18n = initI18n('en');
const t = (key: string, options?: Record<string, unknown>): string => i18n.t(key, options);

describe('failureMessage', () => {
  it('names the file when a named copy exists', () => {
    expect(failureMessage('encrypted', 'protected.pdf', t)).toBe(
      '"protected.pdf" is password-protected. Tools can\'t open protected PDFs yet.',
    );
  });
  it('uses the unnamed copy without a name', () => {
    expect(failureMessage('encrypted', null, t)).toBe(
      "This PDF is password-protected. Tools can't open protected PDFs yet.",
    );
  });
  it('uses the unnamed copy when no named key exists', () => {
    expect(failureMessage('io', 'a.pdf', t)).toBe(
      "Couldn't save the file. Check free space and try again.",
    );
  });
  it('strips bidi controls from the name', () => {
    expect(failureMessage('notFound', '‮fdp.exe‬', t)).toBe('"fdp.exe" no longer exists');
  });
});
