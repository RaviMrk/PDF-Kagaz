import {
  clampPlacement,
  DEFAULT_PLACEMENT,
  MAX_PLACEMENTS,
  MAX_WIDTH,
  MIN_WIDTH,
  nudge,
  presetPlacement,
  resize,
} from '../placement';

/** Height of the signature as a fraction of the page height. */
const heightOf = (width: number, aspect: number, pageAspect: number) =>
  (width * aspect) / pageAspect;

describe('placement', () => {
  it('has the exact limits and default', () => {
    expect(MIN_WIDTH).toBe(0.08);
    expect(MAX_WIDTH).toBe(0.9);
    expect(MAX_PLACEMENTS).toBe(50);
    expect(DEFAULT_PLACEMENT).toEqual({ cx: 0.72, cy: 0.85, width: 0.3 });
  });

  it('keeps the whole signature inside the page', () => {
    const p = clampPlacement({ cx: 0.99, cy: 0.99, width: 0.3 }, 0.5, 1.414);
    const h = heightOf(p.width, 0.5, 1.414);
    expect(p.width).toBe(0.3);
    expect(p.cx + p.width / 2).toBeLessThanOrEqual(1);
    expect(p.cy + h / 2).toBeLessThanOrEqual(1);
    expect(p.cx + p.width / 2).toBeCloseTo(1);
    expect(p.cy + h / 2).toBeCloseTo(1);
    const q = clampPlacement({ cx: -1, cy: -1, width: 0.3 }, 0.5, 1.414);
    expect(q.cx - q.width / 2).toBeCloseTo(0);
    expect(q.cy - heightOf(q.width, 0.5, 1.414) / 2).toBeCloseTo(0);
  });

  it('clamps the width to 0.08..0.9', () => {
    expect(clampPlacement({ cx: 0.5, cy: 0.5, width: 2 }, 0.5, 1.414).width).toBe(0.9);
    expect(clampPlacement({ cx: 0.5, cy: 0.5, width: 0.01 }, 0.5, 1.414).width).toBe(0.08);
  });

  it('narrows a signature that would be taller than the page', () => {
    // A tall signature (h / w = 3) on a landscape page (h / w = 0.7).
    const p = clampPlacement({ cx: 0.5, cy: 0.5, width: 0.5 }, 3, 0.7);
    expect(heightOf(p.width, 3, 0.7)).toBeLessThanOrEqual(1 + 1e-9);
    expect(p.cy).toBeCloseTo(0.5);
  });

  it('a value that is not a number falls back to the default', () => {
    expect(clampPlacement({ cx: NaN, cy: NaN, width: NaN }, 0.5, 1.414)).toEqual(
      clampPlacement(DEFAULT_PLACEMENT, 0.5, 1.414),
    );
  });

  it('nudges by 0.02 and stays clamped past the edge', () => {
    expect(nudge(DEFAULT_PLACEMENT, 'right').cx).toBeCloseTo(0.74);
    expect(nudge(DEFAULT_PLACEMENT, 'left').cx).toBeCloseTo(0.7);
    expect(nudge(DEFAULT_PLACEMENT, 'up').cy).toBeCloseTo(0.83);
    expect(nudge(DEFAULT_PLACEMENT, 'down', 0.05).cy).toBeCloseTo(0.9);
    let p = DEFAULT_PLACEMENT;
    for (let i = 0; i < 40; i++) p = nudge(p, 'right');
    expect(p.cx + p.width / 2).toBeCloseTo(1);
    for (let i = 0; i < 80; i++) p = nudge(p, 'down');
    expect(p.cy).toBeLessThanOrEqual(1);
    for (let i = 0; i < 80; i++) p = nudge(p, 'up');
    expect(p.cy).toBeGreaterThanOrEqual(0);
  });

  it('resizes about the centre, within the width limits', () => {
    expect(resize(DEFAULT_PLACEMENT, 1.1).width).toBeCloseTo(0.33);
    expect(resize(DEFAULT_PLACEMENT, 1.1).cx).toBe(0.72);
    expect(resize(DEFAULT_PLACEMENT, 0.9).width).toBeCloseTo(0.27);
    expect(resize(DEFAULT_PLACEMENT, 10).width).toBe(0.9);
    expect(resize(DEFAULT_PLACEMENT, 0.01).width).toBe(0.08);
  });

  it('maps a position preset to the page with a 6 % margin', () => {
    const p = { cx: 0.5, cy: 0.5, width: 0.3 };
    const h = heightOf(0.3, 0.5, 1.414);
    const bl = presetPlacement('bottom-left', p, 0.5, 1.414);
    expect(bl.cx).toBeCloseTo(0.06 + 0.15);
    expect(bl.cy).toBeCloseTo(1 - 0.06 - h / 2);
    expect(bl.width).toBe(0.3);
    const tr = presetPlacement('top-right', p, 0.5, 1.414);
    expect(tr.cx).toBeCloseTo(1 - 0.06 - 0.15);
    expect(tr.cy).toBeCloseTo(0.06 + h / 2);
    expect(presetPlacement('center', { ...p, cx: 0.1, cy: 0.9 }, 0.5, 1.414)).toEqual(p);
  });
});
