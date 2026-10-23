export const JS_MAX_FILE_BYTES = 31_457_280;
export const JS_MAX_TOTAL_BYTES = 104_857_600;
export const ORGANIZE_MAX_PAGES = 300;

export type SizeCheck =
  | { ok: true }
  | { ok: false; reason: 'tooLarge'; index: number }
  | { ok: false; reason: 'totalTooLarge' };

/** First file over the per-file cap wins; otherwise the combined size is checked. */
export function checkInputSizes(sizes: readonly number[]): SizeCheck {
  const index = sizes.findIndex((s) => s > JS_MAX_FILE_BYTES);
  if (index >= 0) return { ok: false, reason: 'tooLarge', index };
  if (sizes.reduce((a, b) => a + b, 0) > JS_MAX_TOTAL_BYTES)
    return { ok: false, reason: 'totalTooLarge' };
  return { ok: true };
}

export const IMAGES_MAX = 100;
export const IMAGE_MAX_BYTES = 52_428_800;
export const IMAGE_MAX_LONG_SIDE_PX = 2400;
export const IMAGE_JPEG_QUALITY = 85;
