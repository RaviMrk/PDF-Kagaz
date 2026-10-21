import { redirectSystemPath } from '../../../../app/+native-intent';
import { incomingPdfHref, isIncomingPdfUri, takeIncomingUri } from '../incomingLink';

const NONCE_HREF = /^\/open\?t=([0-9a-f-]{36})$/;

function nonceOf(href: string | null): string {
  const m = href == null ? null : NONCE_HREF.exec(href);
  if (!m) throw new Error(`not a nonce href: ${href}`);
  return m[1]!;
}

describe('isIncomingPdfUri', () => {
  it('accepts raw content:// and file:// uris only', () => {
    expect(
      isIncomingPdfUri('content://com.android.providers.downloads.documents/document/42'),
    ).toBe(true);
    expect(isIncomingPdfUri('file:///sdcard/Download/a b.pdf')).toBe(true);
    expect(isIncomingPdfUri('/home')).toBe(false);
    expect(isIncomingPdfUri('pdftoolkit://reader/1')).toBe(false);
  });
});

describe('incomingPdfHref', () => {
  it('routes to /open with an opaque nonce that maps back to the exact raw uri once', () => {
    const raw = 'content://com.android.providers.downloads.documents/document/msf%3A1000001234';
    const href = incomingPdfHref(raw);
    expect(href).not.toContain('content');
    expect(takeIncomingUri(nonceOf(href))).toBe(raw);
    expect(takeIncomingUri(nonceOf(href))).toBeNull();
  });

  it('gives each incoming uri its own nonce', () => {
    const a = nonceOf(incomingPdfHref('content://x/1'));
    const b = nonceOf(incomingPdfHref('content://x/1'));
    expect(a).not.toBe(b);
    expect(takeIncomingUri(b)).toBe('content://x/1');
    expect(takeIncomingUri(a)).toBe('content://x/1');
  });

  it('is null for app paths', () => {
    expect(incomingPdfHref('/home')).toBeNull();
    expect(incomingPdfHref('pdftoolkit://reader/1')).toBeNull();
  });

  it('forgets the oldest nonces beyond 16', () => {
    const first = nonceOf(incomingPdfHref('content://x/first'));
    for (let i = 0; i < 16; i++) incomingPdfHref(`content://x/${i}`);
    expect(takeIncomingUri(first)).toBeNull();
  });

  it('knows nothing of unknown nonces', () => {
    expect(takeIncomingUri('nope')).toBeNull();
    expect(takeIncomingUri('')).toBeNull();
  });
});

describe('redirectSystemPath', () => {
  it('passes app paths through', () => {
    expect(redirectSystemPath({ path: '/home', initial: true })).toBe('/home');
    expect(redirectSystemPath({ path: 'pdftoolkit://files', initial: false })).toBe(
      'pdftoolkit://files',
    );
  });

  it('rewrites a system VIEW of a PDF to a nonce for the byte-identical uri', () => {
    const raw =
      'content://com.google.android.apps.docs.storage/document/acc%3D1%3Bdoc%3D%E0%A4%85%2Fx';
    const href = redirectSystemPath({ path: raw, initial: false });
    expect(takeIncomingUri(nonceOf(href))).toBe(raw);
  });

  it.each([
    'pdftoolkit://open?uri=file%3A%2F%2F%2Fsdcard%2Fa.pdf',
    'exp+pdf-toolkit://open?uri=file%3A%2F%2F%2Fsdcard%2Fa.pdf',
    'pdftoolkit:///open?t=abc',
    'pdftoolkit://OPEN/?uri=content%3A%2F%2Fx%2F1',
    '/open?uri=content%3A%2F%2Fx%2F1',
    'pdftoolkit://(tabs)/open?uri=x',
  ])('sends app deep links to /open to / (%s)', (path) => {
    expect(redirectSystemPath({ path, initial: true })).toBe('/');
    expect(redirectSystemPath({ path, initial: false })).toBe('/');
  });

  it('falls back to / on a bad path', () => {
    // A truncated percent-encoding makes decodeURIComponent throw.
    expect(redirectSystemPath({ path: 'pdftoolkit://%E0%A4', initial: true })).toBe('/');
  });
});
