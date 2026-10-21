import { redirectSystemPath } from '../../../../app/+native-intent';
import { incomingPdfHref } from '../incomingLink';

describe('incomingPdfHref', () => {
  it('routes a content:// PDF to /open with the uri encoded', () => {
    expect(incomingPdfHref('content://com.android.providers.downloads.documents/document/42')).toBe(
      '/open?uri=content%3A%2F%2Fcom.android.providers.downloads.documents%2Fdocument%2F42',
    );
  });

  it('routes a file:// PDF to /open with the uri encoded', () => {
    expect(incomingPdfHref('file:///sdcard/Download/a b.pdf')).toBe(
      `/open?uri=${encodeURIComponent('file:///sdcard/Download/a b.pdf')}`,
    );
  });

  it('ignores app paths and the app scheme', () => {
    expect(incomingPdfHref('/home')).toBeNull();
    expect(incomingPdfHref('pdftoolkit://reader/1')).toBeNull();
  });
});

describe('redirectSystemPath', () => {
  it('passes app paths through', () => {
    expect(redirectSystemPath({ path: '/home', initial: true })).toBe('/home');
  });

  it('rewrites incoming PDFs', () => {
    expect(redirectSystemPath({ path: 'content://x/1', initial: false })).toBe(
      '/open?uri=content%3A%2F%2Fx%2F1',
    );
  });

  it('falls back to / on a bad path', () => {
    // A lone surrogate makes encodeURIComponent throw.
    expect(redirectSystemPath({ path: 'content://x/\uD800', initial: true })).toBe('/');
  });
});
