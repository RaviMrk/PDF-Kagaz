/** @jest-environment node */
import { initI18n } from '@/i18n';
import { formatBytes } from '@/utils/fileSize';

import { JS_CAPS, NATIVE_CAPS } from '../limits';

import { failureMessage, jobFailureMessage } from '../failureMessage';

const i18n = initI18n('en');
const t = (key: string, options?: Record<string, unknown>): string => i18n.t(key, options);

describe('failureMessage', () => {
  it('names the file when a named copy exists', () => {
    expect(failureMessage('encrypted', 'protected.pdf', t)).toBe(
      '"protected.pdf" is password-protected. Start the tool again and enter its password.',
    );
  });
  it('uses the unnamed copy without a name', () => {
    expect(failureMessage('encrypted', null, t)).toBe(
      'This PDF is password-protected. Start the tool again and enter its password.',
    );
  });
  it('uses the unnamed copy when no named key exists', () => {
    expect(failureMessage('io', 'a.pdf', t)).toBe(
      "Couldn't save the file. Check free space and try again.",
    );
  });
  it('formats the limit for the caps it is given (native by default)', () => {
    expect(failureMessage('tooLarge', null, t)).toBe(
      `This file is larger than ${formatBytes(NATIVE_CAPS.file)}, the most this tool can handle`,
    );
    expect(failureMessage('totalTooLarge', null, t, JS_CAPS)).toBe(
      `These files are over ${formatBytes(JS_CAPS.total)} together. Use fewer files at a time.`,
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
      `These files are over ${formatBytes(1_073_741_824)} together. Use fewer files at a time.`,
    );
  });
  it('names the gallery folder when PDF to images cannot save', () => {
    expect(jobFailureMessage('permission', null, 0, t, 'pdf-to-images')).toBe(
      "PDF Toolkit can't save to Pictures/PDFToolkit. Check storage access in Settings.",
    );
    expect(jobFailureMessage('permission', null, 0, t, 'merge')).toBe(
      "PDF Toolkit can't save to Documents/PDFToolkit. Check storage access in Settings.",
    );
    // An input it can no longer read still names the input.
    expect(jobFailureMessage('permission', 'a.pdf', 0, t, 'pdf-to-images')).toBe(
      failureMessage('permission', 'a.pdf', t),
    );
  });
  it('gives the size limit of the tool', () => {
    const native = formatBytes(536_870_912);
    expect(jobFailureMessage('tooLarge', null, 0, t, 'compress')).toBe(
      `This file is larger than ${native}, the most this tool can handle`,
    );
    expect(jobFailureMessage('tooLarge', 'big.pdf', 0, t, 'merge')).toBe(
      `"big.pdf" is larger than ${native}, the most this tool can handle`,
    );
  });
  it('has copy for the password failures', () => {
    expect(jobFailureMessage('wrongPassword', 'a.pdf', 0, t, 'unlock')).toBe(
      "That password didn't open the PDF",
    );
    expect(jobFailureMessage('restricted', 'a.pdf', 0, t, 'compress')).toBe(
      "This PDF doesn't allow changes. Enter its owner password to use it in a tool.",
    );
    expect(jobFailureMessage('signatureGone', null, 0, t, 'sign')).toBe(
      'A signature you placed was deleted. Place it again.',
    );
  });
});
