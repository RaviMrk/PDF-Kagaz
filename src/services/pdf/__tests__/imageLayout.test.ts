/** @jest-environment node */
import { PdfToolError } from '../pdfErrors';
import {
  DEFAULT_IMAGES_LAYOUT,
  DEFAULT_SCAN_LAYOUT,
  isImageLayout,
  placeImage,
  type ImageLayoutOptions,
} from '../imageLayout';

const layout = (
  pageSize: ImageLayoutOptions['pageSize'],
  orientation: ImageLayoutOptions['orientation'],
  margin: ImageLayoutOptions['margin'],
): ImageLayoutOptions => ({ pageSize, orientation, margin });

function expectPlacement(
  p: ReturnType<typeof placeImage>,
  want: [number, number, number, number, number, number],
) {
  const got = [p.pageWidth, p.pageHeight, p.x, p.y, p.width, p.height];
  got.forEach((v, i) => expect(v).toBeCloseTo(want[i] as number, 2));
}

describe('placeImage', () => {
  it('lands a landscape image on a landscape A4 page without margins', () => {
    expectPlacement(
      placeImage(400, 300, layout('a4', 'auto', 'none')),
      [842, 595, 24.33, 0, 793.33, 595],
    );
  });
  it('fits a portrait image inside small margins and centres it', () => {
    expectPlacement(
      placeImage(300, 400, layout('a4', 'auto', 'small')),
      [595, 842, 18, 48.33, 559, 745.33],
    );
  });
  it('forces portrait for a landscape image', () => {
    expectPlacement(
      placeImage(400, 300, layout('a4', 'portrait', 'none')),
      [595, 842, 0, 197.88, 595, 446.25],
    );
  });
  it('forces landscape for a portrait image on Letter with large margins', () => {
    expectPlacement(
      placeImage(300, 400, layout('letter', 'landscape', 'large')),
      [792, 612, 193.5, 36, 405, 540],
    );
  });
  it('keeps the aspect ratio of a panorama', () => {
    const p = placeImage(20000, 1500, layout('a4', 'auto', 'none'));
    expect(p.pageWidth).toBe(842);
    expect(p.width).toBeCloseTo(842, 2);
    expect(p.height).toBeCloseTo(63.15, 2);
  });
  it('scales a 1 x 1 image up to the box and centres it', () => {
    expectPlacement(placeImage(1, 1, layout('a4', 'auto', 'none')), [595, 842, 0, 123.5, 595, 595]);
  });
  it('fit: page equals the image box scaled to the A4 long side', () => {
    expectPlacement(
      placeImage(400, 300, layout('fit', 'portrait', 'none')),
      [842, 631.5, 0, 0, 842, 631.5],
    );
  });
  it('fit: margins surround the image on every side', () => {
    expectPlacement(
      placeImage(300, 400, layout('fit', 'auto', 'small')),
      [667.5, 878, 18, 18, 631.5, 842],
    );
  });
  it.each([
    [0, 10],
    [10, 0],
    [-1, 10],
    [Number.NaN, 10],
  ])('rejects non-positive dimensions (%p, %p)', (w, h) => {
    expect.assertions(2);
    try {
      placeImage(w, h, DEFAULT_IMAGES_LAYOUT);
    } catch (e) {
      expect(e).toBeInstanceOf(PdfToolError);
      expect((e as PdfToolError).kind).toBe('invalid');
    }
  });
});

describe('layout options', () => {
  it('has the documented defaults', () => {
    expect(DEFAULT_IMAGES_LAYOUT).toEqual({ pageSize: 'a4', orientation: 'auto', margin: 'small' });
    expect(DEFAULT_SCAN_LAYOUT).toEqual({ pageSize: 'fit', orientation: 'auto', margin: 'none' });
  });
  it('validates layouts', () => {
    expect(isImageLayout(DEFAULT_IMAGES_LAYOUT)).toBe(true);
    expect(isImageLayout({ ...DEFAULT_IMAGES_LAYOUT, pageSize: 'a5' })).toBe(false);
    expect(isImageLayout({ ...DEFAULT_IMAGES_LAYOUT, margin: 'huge' })).toBe(false);
    expect(isImageLayout({ ...DEFAULT_IMAGES_LAYOUT, orientation: 1 })).toBe(false);
    expect(isImageLayout(null)).toBe(false);
    expect(isImageLayout({ pageSize: 'a4' })).toBe(false);
  });
});
