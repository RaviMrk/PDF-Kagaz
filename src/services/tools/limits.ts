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

export type ImageQuality = 'compact' | 'standard' | 'high';
export const IMAGE_QUALITIES: readonly ImageQuality[] = ['compact', 'standard', 'high'];

export type ImageQualityLevel = { longSidePx: number; jpegQuality: number };

/**
 * Images and scans: each preset is a ladder of levels, sharpest first. The first page is prepared
 * at the first level; a page over its share of the total budget is prepared once more one level
 * lower (again, while it is still over and a lower level exists), and the job never goes back up.
 * High's ladder passes through Standard's levels, so Sharper never ends softer than Standard or
 * fails where Standard fits.
 */
export const IMAGE_QUALITY_PRESETS: Record<ImageQuality, readonly ImageQualityLevel[]> = {
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
};

export const IMAGE_MAX_LONG_SIDE_PX = IMAGE_QUALITY_PRESETS.standard[0]!.longSidePx;
export const IMAGE_JPEG_QUALITY = IMAGE_QUALITY_PRESETS.standard[0]!.jpegQuality;

/**
 * Images and scans: a prepared page over its share of `JS_MAX_TOTAL_BYTES × IMAGE_TOTAL_BUDGET`
 * (what is left, split over the pages left) is prepared once more at the preset's next level.
 */
export const IMAGE_TOTAL_BUDGET = 0.95;
export const IMAGE_SMALLER_LONG_SIDE_PX = IMAGE_QUALITY_PRESETS.standard[1]!.longSidePx;
export const IMAGE_SMALLER_JPEG_QUALITY = IMAGE_QUALITY_PRESETS.standard[1]!.jpegQuality;
