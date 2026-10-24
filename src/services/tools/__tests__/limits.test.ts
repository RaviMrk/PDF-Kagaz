import {
  checkInputSizes,
  IMAGES_MAX,
  IMAGE_JPEG_QUALITY,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_LONG_SIDE_PX,
  IMAGE_QUALITIES,
  IMAGE_QUALITY_PRESETS,
} from '../limits';

describe('image limits', () => {
  it('has the documented values', () => {
    expect(IMAGES_MAX).toBe(100);
    expect(IMAGE_MAX_BYTES).toBe(52_428_800);
    expect(IMAGE_MAX_LONG_SIDE_PX).toBe(2400);
    expect(IMAGE_JPEG_QUALITY).toBe(85);
  });
});

describe('image quality presets', () => {
  it('has the documented presets', () => {
    expect(IMAGE_QUALITIES).toEqual(['compact', 'standard', 'high']);
    expect(IMAGE_QUALITY_PRESETS).toEqual({
      compact: {
        longSidePx: 1600,
        jpegQuality: 75,
        smallerLongSidePx: 1200,
        smallerJpegQuality: 65,
      },
      standard: {
        longSidePx: 2400,
        jpegQuality: 85,
        smallerLongSidePx: 1600,
        smallerJpegQuality: 75,
      },
      high: { longSidePx: 3200, jpegQuality: 90, smallerLongSidePx: 2400, smallerJpegQuality: 85 },
    });
  });
  it('keeps the M5 constants as the standard preset', () => {
    expect(IMAGE_MAX_LONG_SIDE_PX).toBe(IMAGE_QUALITY_PRESETS.standard.longSidePx);
    expect(IMAGE_JPEG_QUALITY).toBe(IMAGE_QUALITY_PRESETS.standard.jpegQuality);
  });
});

describe('checkInputSizes', () => {
  it('flags the first file over the cap', () => {
    expect(checkInputSizes([1, 31_457_281])).toEqual({ ok: false, reason: 'tooLarge', index: 1 });
  });
  it('accepts a file exactly at the cap', () => {
    expect(checkInputSizes([31_457_280])).toEqual({ ok: true });
  });
  it('flags a total over the cap', () => {
    expect(checkInputSizes([30e6, 30e6, 30e6, 30e6])).toEqual({
      ok: false,
      reason: 'totalTooLarge',
    });
  });
});
