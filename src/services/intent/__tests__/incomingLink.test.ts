import { redirectSystemPath } from '../../../../app/+native-intent';
import { allowIncomingUri, incomingPdfHref, takeIncomingPermit } from '../incomingLink';

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

describe('app deep links to /open', () => {
  it.each([
    'pdftoolkit://open?uri=file%3A%2F%2F%2Fsdcard%2Fa.pdf',
    'exp+pdf-toolkit://open?uri=file%3A%2F%2F%2Fsdcard%2Fa.pdf',
    'pdftoolkit:///open?uri=content%3A%2F%2Fx%2F1',
    'pdftoolkit://OPEN/?uri=content%3A%2F%2Fx%2F1',
    '/open?uri=content%3A%2F%2Fx%2F1',
    'pdftoolkit://(tabs)/open?uri=x',
  ])('are sent to / (%s)', (path) => {
    expect(redirectSystemPath({ path, initial: true })).toBe('/');
    expect(redirectSystemPath({ path, initial: false })).toBe('/');
  });

  it('still passes other app links through', () => {
    expect(redirectSystemPath({ path: 'pdftoolkit://files', initial: false })).toBe(
      'pdftoolkit://files',
    );
  });
});

describe('incoming permits', () => {
  it('a system VIEW of a PDF grants one permit for its uri', () => {
    redirectSystemPath({ path: 'content://x/9', initial: false });
    expect(takeIncomingPermit('content://x/9')).toBe(true);
    expect(takeIncomingPermit('content://x/9')).toBe(false);
  });

  it('a rejected deep link grants nothing', () => {
    redirectSystemPath({ path: 'pdftoolkit://open?uri=content%3A%2F%2Fx%2F8', initial: true });
    expect(takeIncomingPermit('content://x/8')).toBe(false);
  });

  it('allowIncomingUri grants a permit for exactly that uri', () => {
    allowIncomingUri('content://x/7');
    expect(takeIncomingPermit('content://x/6')).toBe(false);
    expect(takeIncomingPermit('content://x/7')).toBe(true);
  });
});
