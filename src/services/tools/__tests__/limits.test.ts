import {
  capsFor,
  checkInputSizes,
  JS_CAPS,
  JS_MAX_FILE_BYTES,
  JS_MAX_TOTAL_BYTES,
  NATIVE_CAPS,
  routeFor,
  TOOL_ENGINE,
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
      compact: [
        { longSidePx: 1600, jpegQuality: 75 },
        { longSidePx: 1200, jpegQuality: 65 },
      ],
      standard: [
        { longSidePx: 2400, jpegQuality: 85 },
        { longSidePx: 1600, jpegQuality: 75 },
      ],
      high: [
        { longSidePx: 3200, jpegQuality: 90 },
        { longSidePx: 2400, jpegQuality: 85 },
        { longSidePx: 1600, jpegQuality: 75 },
      ],
    });
  });
  it('keeps the M5 constants as the standard preset', () => {
    expect(IMAGE_MAX_LONG_SIDE_PX).toBe(IMAGE_QUALITY_PRESETS.standard[0]!.longSidePx);
    expect(IMAGE_JPEG_QUALITY).toBe(IMAGE_QUALITY_PRESETS.standard[0]!.jpegQuality);
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

describe('caps and routing', () => {
  const MiB = 1_048_576;
  it('has the exact caps, the JS byte constants staying as aliases', () => {
    expect(JS_CAPS).toEqual({ file: 31_457_280, total: 104_857_600 });
    expect(NATIVE_CAPS).toEqual({ file: 536_870_912, total: 1_073_741_824 });
    expect(JS_MAX_FILE_BYTES).toBe(JS_CAPS.file);
    expect(JS_MAX_TOTAL_BYTES).toBe(JS_CAPS.total);
  });
  it('gives images the JS caps and every PDF tool the native caps', () => {
    expect(capsFor('images-to-pdf')).toBe(JS_CAPS);
    expect(capsFor('scan')).toBe(JS_CAPS);
    for (const id of ['merge', 'split', 'organize', 'compress', 'unlock', 'sign'] as const) {
      expect(capsFor(id)).toBe(NATIVE_CAPS);
    }
    expect(TOOL_ENGINE).toMatchObject({
      merge: 'routed',
      watermark: 'routed',
      compress: 'native',
      'pdf-to-images': 'native',
      scan: 'images',
    });
  });
  it('routes a routed tool to JS while it fits the JS caps', () => {
    expect(routeFor('merge', [30 * MiB, 30 * MiB])).toBe('js');
    expect(routeFor('merge', [31 * MiB])).toBe('native');
    expect(routeFor('merge', [40 * MiB, 40 * MiB, 30 * MiB])).toBe('native');
  });
  it('always routes a native tool natively', () => {
    expect(routeFor('compress', [1])).toBe('native');
  });
  it('lets the caller pass other caps', () => {
    expect(routeFor('split', [11], { js: { file: 10, total: 10 }, native: NATIVE_CAPS })).toBe(
      'native',
    );
  });
  it('checks sizes against the caps it is given', () => {
    expect(checkInputSizes([600 * MiB], NATIVE_CAPS)).toEqual({
      ok: false,
      reason: 'tooLarge',
      index: 0,
    });
    expect(checkInputSizes([40 * MiB], NATIVE_CAPS)).toEqual({ ok: true });
  });
});
