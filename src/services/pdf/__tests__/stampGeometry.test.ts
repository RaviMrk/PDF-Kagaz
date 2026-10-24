/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';

import {
  normalizeRotation,
  placeOnPage,
  positionCenter,
  rotatedBounds,
  visualSize,
  type PageBox,
} from '../stampGeometry';
import type { StampPosition } from '../../tools/runTool';

type Size = { width: number; height: number };
type Vector = {
  name: string;
  fn: string;
  args: Record<string, unknown>;
  expected: Record<string, number>;
};

function run(v: Vector): Record<string, number> {
  const a = v.args;
  switch (v.fn) {
    case 'rotatedBounds':
      return rotatedBounds(a.width as number, a.height as number, a.angleDeg as number);
    case 'positionCenter':
      return positionCenter(
        a.position as StampPosition,
        a.visual as Size,
        a.box as Size,
        a.marginPt as number,
      );
    case 'placeOnPage':
      return placeOnPage(
        a.page as PageBox,
        a.center as { cx: number; cy: number },
        a.box as Size,
        a.angleDeg as number,
      );
    default:
      throw new Error(`unknown fn ${v.fn}`);
  }
}

describe('stamp geometry vectors (shared with StampGeometryTest)', () => {
  const all = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '..', '..', '..', '..', '__fixtures__', 'stamp-vectors.json'),
      'utf8',
    ),
  ) as Vector[];

  it('covers every case the plan asks for', () => {
    expect(all.length).toBeGreaterThanOrEqual(16);
    const placed = all.filter((v) => v.fn === 'placeOnPage');
    for (const rotation of [0, 90, 180, 270]) {
      for (const [x, y] of [
        [0, 0],
        [20, 30],
      ]) {
        for (const angle of [0, 45]) {
          expect(
            placed.some((v) => {
              const page = v.args.page as PageBox;
              return (
                page.rotation === rotation &&
                page.x === x &&
                page.y === y &&
                v.args.angleDeg === angle
              );
            }),
          ).toBe(true);
        }
      }
    }
    const positions = new Set(
      all
        .filter((v) => v.fn === 'positionCenter' && v.args.marginPt === 24)
        .map((v) => v.args.position),
    );
    expect(positions.size).toBe(9);
  });

  it.each(all.map((v) => [v.name, v] as const))('%s', (_name, v) => {
    const actual = run(v);
    for (const [key, value] of Object.entries(v.expected)) {
      expect(Math.abs((actual[key] ?? NaN) - value)).toBeLessThanOrEqual(0.01);
    }
  });
});

describe('visualSize', () => {
  const page = (rotation: PageBox['rotation']): PageBox => ({
    x: 20,
    y: 30,
    width: 600,
    height: 800,
    rotation,
  });

  it('keeps the CropBox size for 0 and 180', () => {
    expect(visualSize(page(0))).toEqual({ width: 600, height: 800 });
    expect(visualSize(page(180))).toEqual({ width: 600, height: 800 });
  });

  it('swaps width and height for 90 and 270', () => {
    expect(visualSize(page(90))).toEqual({ width: 800, height: 600 });
    expect(visualSize(page(270))).toEqual({ width: 800, height: 600 });
  });
});

describe('normalizeRotation', () => {
  it('folds /Rotate into 0..270 and ignores values that are not right angles (like PdfBox)', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(45)).toBe(0);
  });
});
