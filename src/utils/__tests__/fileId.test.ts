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

  it('equals the BigInt FNV-1a 64 reference for many URIs (ids are persisted)', () => {
    const reference = (input: string): string => {
      let hash = 0xcbf29ce484222325n;
      for (const byte of new TextEncoder().encode(input)) {
        hash = ((hash ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
      }
      return hash.toString(16).padStart(16, '0');
    };
    const samples = ['', 'a', '\u{1F4C4}.pdf', '\u0905\u0939\u0935\u093E\u0932.pdf', 'caf\u00E9'];
    let seed = 42;
    for (let i = 0; i < 300; i++) {
      let s = 'file:///storage/emulated/0/';
      const len = i % 40;
      for (let j = 0; j < len; j++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        s += String.fromCodePoint(
          [seed % 128, 0x900 + (seed % 128), 0x1f300 + (seed % 64)][seed % 3]!,
        );
      }
      samples.push(s);
    }
    for (const s of samples) expect(fileIdForUri(s)).toBe(reference(s));
  });

  it('encodes astral characters as 4-byte UTF-8', () => {
    expect(fileIdForUri('\u{1F4C4}.pdf')).toMatch(/^[0-9a-f]{16}$/);
  });
});
