import {
  checkInputSizes,
  IMAGES_MAX,
  IMAGE_JPEG_QUALITY,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_LONG_SIDE_PX,
} from '../limits';

describe('image limits', () => {
  it('has the documented values', () => {
    expect(IMAGES_MAX).toBe(100);
    expect(IMAGE_MAX_BYTES).toBe(52_428_800);
    expect(IMAGE_MAX_LONG_SIDE_PX).toBe(2400);
    expect(IMAGE_JPEG_QUALITY).toBe(85);
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
