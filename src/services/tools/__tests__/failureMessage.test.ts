/** @jest-environment node */
import { initI18n } from '@/i18n';

import { failureMessage, jobFailureMessage } from '../failureMessage';

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

describe('jobFailureMessage', () => {
  it('says some files were saved when an interrupted job has outputs', () => {
    expect(jobFailureMessage('interrupted', null, 2, t, 'split')).toBe(
      'The app was closed before this finished. Some files were already saved.',
    );
  });
  it('uses the plain interrupted copy when nothing was saved', () => {
    expect(jobFailureMessage('interrupted', null, 0, t, 'merge')).toBe(
      'The app was closed before this finished.',
    );
  });
  it('falls back to failureMessage for other failures', () => {
    expect(jobFailureMessage('encrypted', 'protected.pdf', 1, t, 'merge')).toBe(
      failureMessage('encrypted', 'protected.pdf', t),
    );
  });
  it('explains an over-cap image or scan job with images copy, not the merge copy', () => {
    const images = 'These images are too large together for one PDF. Use fewer images.';
    expect(jobFailureMessage('totalTooLarge', null, 0, t, 'images-to-pdf')).toBe(images);
    expect(jobFailureMessage('totalTooLarge', null, 0, t, 'scan')).toBe(images);
    expect(jobFailureMessage('totalTooLarge', null, 0, t, 'merge')).toBe(
      'These files are over 100 MB together. Merge fewer files at a time.',
    );
  });
});
