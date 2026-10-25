import type { StampPosition } from './runTool';

/**
 * Where a signature sits on the page as seen: `cx`, `cy` (its centre) and `width` are fractions of
 * the visual page's width and height. The height follows from the PNG's aspect.
 */
export type Placement = { cx: number; cy: number; width: number };

export const MIN_WIDTH = 0.08;
export const MAX_WIDTH = 0.9;
export const DEFAULT_PLACEMENT: Placement = { cx: 0.72, cy: 0.85, width: 0.3 };
export const MAX_PLACEMENTS = 50;

/** Gap between a preset position and the page edge, as a fraction of the page. */
const PRESET_MARGIN = 0.06;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finite = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);

/** The signature's height as a fraction of the page height. */
function heightFrac(width: number, aspect: number, pageAspect: number): number {
  return (width * aspect) / pageAspect;
}

/**
 * `p` with the width in MIN_WIDTH..MAX_WIDTH and the whole signature inside the page.
 * `aspect` is h / w of the PNG, `pageAspect` h / w of the visual page. A signature that would be
 * taller than the page is narrowed until it fits.
 */
export function clampPlacement(p: Placement, aspect: number, pageAspect: number): Placement {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const pa = pageAspect > 0 && Number.isFinite(pageAspect) ? pageAspect : 1;
  let width = clamp(finite(p.width, DEFAULT_PLACEMENT.width), MIN_WIDTH, MAX_WIDTH);
  width = Math.min(width, pa / a);
  const h = heightFrac(width, a, pa);
  return {
    cx: clamp(finite(p.cx, DEFAULT_PLACEMENT.cx), width / 2, 1 - width / 2),
    cy: clamp(finite(p.cy, DEFAULT_PLACEMENT.cy), h / 2, 1 - h / 2),
    width,
  };
}

/**
 * `p` moved by `step` of the page. The centre stays where the signature's width fits across the
 * page and on the page vertically; callers clamp with the aspects for the exact vertical edge.
 */
export function nudge(p: Placement, dir: 'up' | 'down' | 'left' | 'right', step = 0.02): Placement {
  const dx = dir === 'left' ? -step : dir === 'right' ? step : 0;
  const dy = dir === 'up' ? -step : dir === 'down' ? step : 0;
  return {
    cx: clamp(p.cx + dx, p.width / 2, 1 - p.width / 2),
    cy: clamp(p.cy + dy, 0, 1),
    width: p.width,
  };
}

/** `p` scaled about its centre by `factor`, the width kept in MIN_WIDTH..MAX_WIDTH. */
export function resize(p: Placement, factor: number): Placement {
  return { ...p, width: clamp(p.width * factor, MIN_WIDTH, MAX_WIDTH) };
}

/** `p` moved to a 3 × 3 position, PRESET_MARGIN in from the edges it touches. */
export function presetPlacement(
  position: StampPosition,
  p: Placement,
  aspect: number,
  pageAspect: number,
): Placement {
  const fit = clampPlacement(p, aspect, pageAspect);
  const h = heightFrac(fit.width, aspect, pageAspect);
  const [row, col] = position === 'center' ? ['middle', 'center'] : position.split('-');
  const cx =
    col === 'left'
      ? PRESET_MARGIN + fit.width / 2
      : col === 'right'
        ? 1 - PRESET_MARGIN - fit.width / 2
        : 0.5;
  const cy =
    row === 'top' ? PRESET_MARGIN + h / 2 : row === 'bottom' ? 1 - PRESET_MARGIN - h / 2 : 0.5;
  return clampPlacement({ cx, cy, width: fit.width }, aspect, pageAspect);
}

/** The 3 × 3 cell the signature's centre is in (the position grid's checked cell). */
export function positionOf(p: Placement): StampPosition {
  const col = p.cx < 1 / 3 ? 'left' : p.cx > 2 / 3 ? 'right' : 'center';
  const row = p.cy < 1 / 3 ? 'top' : p.cy > 2 / 3 ? 'bottom' : 'middle';
  if (row === 'middle') return col === 'center' ? 'center' : (`middle-${col}` as StampPosition);
  return `${row}-${col}` as StampPosition;
}
