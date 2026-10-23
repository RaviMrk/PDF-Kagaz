import { MAX_ERROR_MESSAGE, scrubErrorMessage } from '../scrub';

describe('scrubErrorMessage', () => {
  it('removes a file URI with its path and name', () => {
    const out = scrubErrorMessage('Failed to read file:///storage/emulated/0/Download/Salary.pdf');
    expect(out).toBe('Failed to read <uri>');
  });

  it.each([
    ['content://com.android.providers.downloads/document/42 denied', 'content://', '42'],
    ['open https://example.com/a/Salary.pdf?x=1', 'example.com', 'Salary'],
    ['ENOENT: /storage/emulated/0/Documents/Salary-2026.pdf', '/storage', 'Salary'],
    ['cannot write /data/user/0/com.app/cache/tools/job/out.pdf', '/data', 'out.pdf'],
    ['missing /sdcard/DCIM/IMG_0001.jpg', '/sdcard', 'IMG_0001'],
    ['bad path C:\\Users\\ravi\\Salary.pdf', 'Users', 'Salary'],
    ['relative Download/Salary.pdf', 'Download', 'Salary'],
  ])('redacts %j', (input, gone1, gone2) => {
    const out = scrubErrorMessage(input);
    expect(out).not.toContain(gone1);
    expect(out).not.toContain(gone2);
  });

  it.each(['pdf', 'PDF', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'txt'])(
    'redacts a bare file name ending in .%s',
    (ext) => {
      const out = scrubErrorMessage(`Could not open Salary2026.${ext} now`);
      expect(out).toBe('Could not open <file> now');
    },
  );

  it('redacts quoted text, which may be a name with spaces', () => {
    const out = scrubErrorMessage(`File "My secret report" is locked; 'Other one' too`);
    expect(out).not.toContain('secret');
    expect(out).not.toContain('Other');
    expect(out).toContain('is locked');
  });

  it('keeps an ordinary message and truncates a long one', () => {
    expect(scrubErrorMessage('Invalid PDF structure')).toBe('Invalid PDF structure');
    expect(scrubErrorMessage('x'.repeat(1000))).toHaveLength(MAX_ERROR_MESSAGE);
  });

  it('accepts any value', () => {
    expect(scrubErrorMessage(undefined)).toBe('undefined');
    expect(scrubErrorMessage({ path: '/storage/x/Salary.pdf' })).not.toContain('Salary');
    expect(scrubErrorMessage(42)).toBe('42');
  });
});
