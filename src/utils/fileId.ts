/**
 * Stable file id: FNV-1a 64-bit over the UTF-8 bytes of the uri, as 16 lowercase hex chars.
 * IDs are persisted (bookmarks reference them) - never change this algorithm.
 *
 * The 64-bit state is kept in four 16-bit limbs (h0 lowest) so every product stays exact in a
 * double; this is ~100x faster than BigInt on Hermes, which matters when a scan hashes
 * thousands of URIs on the JS thread. The prime is 2^40 + 0x1b3, i.e. limbs [0x1b3, 0, 0x100, 0].
 */
export function fileIdForUri(uri: string): string {
  let h0 = 0x2325;
  let h1 = 0x8422;
  let h2 = 0x9ce4;
  let h3 = 0xcbf2;

  const mix = (byte: number) => {
    h0 ^= byte;
    const t0 = h0 * 0x1b3;
    const t1 = h1 * 0x1b3 + (t0 >>> 16);
    const t2 = h2 * 0x1b3 + h0 * 0x100 + (t1 >>> 16);
    const t3 = h3 * 0x1b3 + h1 * 0x100 + (t2 >>> 16);
    h0 = t0 & 0xffff;
    h1 = t1 & 0xffff;
    h2 = t2 & 0xffff;
    h3 = t3 & 0xffff;
  };

  // UTF-8 encoding inline (no TextEncoder dependency in Hermes test/runtime variants).
  for (let i = 0; i < uri.length; i++) {
    let cp = uri.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < uri.length) {
      const next = uri.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd; // lone surrogate
    if (cp < 0x80) {
      mix(cp);
    } else if (cp < 0x800) {
      mix(0xc0 | (cp >> 6));
      mix(0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      mix(0xe0 | (cp >> 12));
      mix(0x80 | ((cp >> 6) & 0x3f));
      mix(0x80 | (cp & 0x3f));
    } else {
      mix(0xf0 | (cp >> 18));
      mix(0x80 | ((cp >> 12) & 0x3f));
      mix(0x80 | ((cp >> 6) & 0x3f));
      mix(0x80 | (cp & 0x3f));
    }
  }
  const hex = (limb: number) => limb.toString(16).padStart(4, '0');
  return hex(h3) + hex(h2) + hex(h1) + hex(h0);
}
