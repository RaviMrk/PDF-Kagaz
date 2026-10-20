import { fileIdForUri } from '../fileId';

describe('fileIdForUri', () => {
  it('matches FNV-1a 64 reference vectors', () => {
    expect(fileIdForUri('')).toBe('cbf29ce484222325');
    expect(fileIdForUri('a')).toBe('af63dc4c8601ec8c');
  });

  it('is stable, 16 hex chars, and sensitive to Unicode normalisation', () => {
    const nfc =
      'file:///storage/emulated/0/Download/\u092E\u0930\u093E\u0920\u0940-caf\u00E9.pdf'.normalize(
        'NFC',
      );
    const nfd = nfc.normalize('NFD');
    expect(nfc).not.toBe(nfd);
    const id = fileIdForUri(nfc);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(fileIdForUri(nfc)).toBe(id);
    expect(fileIdForUri(nfd)).not.toBe(id);
  });

  it('encodes astral characters as 4-byte UTF-8', () => {
    expect(fileIdForUri('\u{1F4C4}.pdf')).toMatch(/^[0-9a-f]{16}$/);
  });
});
