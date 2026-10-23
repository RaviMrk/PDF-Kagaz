/** @jest-environment node */
import { readFixture } from '@/test-utils/pdfFixtures';

type Segment = { marker: number; data: Uint8Array };

/** The marker segments of a JPEG up to its first SOS (entropy-coded data follows). */
function segments(jpeg: Uint8Array): Segment[] {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a JPEG');
  const out: Segment[] = [];
  let at = 2;
  while (at + 4 <= jpeg.length) {
    if (jpeg[at] !== 0xff) throw new Error('bad marker');
    const marker = jpeg[at + 1]!;
    const length = (jpeg[at + 2]! << 8) | jpeg[at + 3]!;
    out.push({ marker, data: jpeg.subarray(at + 4, at + 2 + length) });
    if (marker === 0xda) break;
    at += 2 + length;
  }
  return out;
}

/** The Orientation tag (0x0112) of an EXIF APP1 payload's IFD0, either byte order. */
function orientation(app1: Uint8Array): number | null {
  const head = String.fromCharCode(...app1.subarray(0, 6));
  if (head !== 'Exif\0\0') return null;
  const tiff = app1.subarray(6);
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const little = tiff[0] === 0x49;
  const ifd = view.getUint32(4, little);
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little);
  }
  return null;
}

describe('image fixtures', () => {
  it('exif-rotate-90.jpg has exactly one EXIF APP1 segment, with Orientation 6', () => {
    const app1 = segments(readFixture('images/exif-rotate-90.jpg')).filter(
      (s) => s.marker === 0xe1,
    );
    expect(app1).toHaveLength(1);
    expect(orientation(app1[0]!.data)).toBe(6);
  });
});
