import type { StampPosition } from '../tools/runTool';

/** A page's CropBox in user space plus its `/Rotate` (clockwise display rotation). */
export type PageBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
};
type Size = { width: number; height: number };

/**
 * pdf-lib `drawImage` / `drawText` arguments in user space: the origin of the unrotated box and
 * its rotation in degrees counter-clockwise about that origin (0..360).
 */
export type Placement = { x: number; y: number; width: number; height: number; rotate: number };

/** `/Rotate` folded into 0/90/180/270; a value that is not a right angle counts as 0 (as PdfBox does). */
export function normalizeRotation(raw: number): PageBox['rotation'] {
  if (!Number.isInteger(raw) || raw % 90 !== 0) return 0;
  return (((raw % 360) + 360) % 360) as PageBox['rotation'];
}

/** The page as seen: CropBox size, swapped for a quarter turn. */
export function visualSize(page: PageBox): Size {
  const quarter = page.rotation === 90 || page.rotation === 270;
  return quarter
    ? { width: page.height, height: page.width }
    : { width: page.width, height: page.height };
}

/** The axis-aligned bounds of a `w` x `h` box turned by `angleDeg`. */
export function rotatedBounds(w: number, h: number, angleDeg: number): Size {
  const t = (angleDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(t));
  const s = Math.abs(Math.sin(t));
  return { width: w * c + h * s, height: w * s + h * c };
}

/**
 * The centre of a stamp at `position`, in points of the page as seen (origin top-left, y down).
 * `box` is the stamp's bounds as seen (`rotatedBounds`), kept `marginPt` inside the edges.
 */
export function positionCenter(
  position: StampPosition,
  visual: Size,
  box: Size,
  marginPt: number,
): { cx: number; cy: number } {
  const [row, col] = position === 'center' ? ['middle', 'center'] : position.split('-');
  const cx =
    col === 'left'
      ? marginPt + box.width / 2
      : col === 'right'
        ? visual.width - marginPt - box.width / 2
        : visual.width / 2;
  const cy =
    row === 'top'
      ? marginPt + box.height / 2
      : row === 'bottom'
        ? visual.height - marginPt - box.height / 2
        : visual.height / 2;
  return { cx, cy };
}

/**
 * Where to draw a `box` (unrotated stamp size) centred at `center` (points as seen, origin
 * top-left) and turned `angleDeg` counter-clockwise as seen. The page shows its content turned
 * clockwise by `rotation`, so the user-space rotation is `angleDeg + rotation`; the seen centre maps
 * back to user space through the CropBox, and the origin is the centre minus the rotated half-box.
 */
export function placeOnPage(
  page: PageBox,
  center: { cx: number; cy: number },
  box: Size,
  angleDeg: number,
): Placement {
  const { x: x0, y: y0, width: w, height: h, rotation } = page;
  const { cx: vx, cy: vy } = center;
  let ux: number;
  let uy: number;
  switch (rotation) {
    case 90:
      ux = x0 + vy;
      uy = y0 + vx;
      break;
    case 180:
      ux = x0 + w - vx;
      uy = y0 + vy;
      break;
    case 270:
      ux = x0 + w - vy;
      uy = y0 + h - vx;
      break;
    default:
      ux = x0 + vx;
      uy = y0 + h - vy;
  }
  const rotate = (((angleDeg + rotation) % 360) + 360) % 360;
  const t = (rotate * Math.PI) / 180;
  const hw = box.width / 2;
  const hh = box.height / 2;
  return {
    x: ux - (hw * Math.cos(t) - hh * Math.sin(t)),
    y: uy - (hw * Math.sin(t) + hh * Math.cos(t)),
    width: box.width,
    height: box.height,
    rotate,
  };
}
