/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';

import { inspectPages, inspectStamps, readFixture } from '@/test-utils/pdfFixtures';

import {
  applyStamps,
  isWinAnsi,
  labelFor,
  type ImageStamp,
  type StampSpec,
  type TextStamp,
} from '../stamp';

const PNG_URI = 'file:///work/alpha-200x100.png';

function readPng(uri: string): Promise<Uint8Array> {
  if (uri !== PNG_URI) return Promise.reject(new Error('unexpected uri'));
  const file = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '__fixtures__',
    'images',
    'alpha-200x100.png',
  );
  return Promise.resolve(new Uint8Array(fs.readFileSync(file)));
}

function imageStamp(overrides: Partial<ImageStamp> = {}): ImageStamp {
  return {
    kind: 'image',
    png: PNG_URI,
    pages: null,
    anchor: { position: 'center', marginPt: 24 },
    widthFrac: 0.5,
    angle: 45,
    opacity: 0.35,
    ...overrides,
  };
}

function textStamp(overrides: Partial<TextStamp> = {}): TextStamp {
  return {
    kind: 'text',
    template: 'Page {n} of {total}',
    start: 1,
    pages: null,
    position: 'bottom-center',
    fontSize: 12,
    marginPt: 28,
    ...overrides,
  };
}

const spec = (...stamps: StampSpec['stamps']): StampSpec => ({ stamps });

describe('labelFor', () => {
  it('replaces every {n} and {total}', () => {
    expect(labelFor('Page {n} of {total}', 3, 9)).toBe('Page 3 of 9');
    expect(labelFor('{n}/{total} ({n})', 2, 5)).toBe('2/5 (2)');
    expect(labelFor('{n}', 7, 7)).toBe('7');
  });
});

describe('isWinAnsi', () => {
  it('accepts ASCII, Latin-1 letters and the cp1252 extras', () => {
    expect(isWinAnsi('Page 1 of 2')).toBe(true);
    expect(isWinAnsi('Seite 1 von 2 – é €')).toBe(true);
  });

  it('refuses Devanagari and other scripts', () => {
    expect(isWinAnsi('पृष्ठ 1')).toBe(false);
    expect(isWinAnsi('页 1')).toBe(false);
  });
});

describe('applyStamps', () => {
  it('stamps an image with its opacity on one-page.pdf', async () => {
    const out = await applyStamps(readFixture('one-page.pdf'), spec(imageStamp()), readPng);
    const [page] = await inspectStamps(out);
    expect(page?.imageDraws).toBe(1);
    expect(page?.opacities).toContain(0.35);
  });

  it('changes only the chosen page and places it on the page as seen (rotated page 3)', async () => {
    const source = readFixture('mixed-sizes.pdf');
    const before = await inspectStamps(source);
    const out = await applyStamps(
      source,
      spec(imageStamp({ pages: [3], angle: 0, opacity: 1 })),
      readPng,
    );
    const after = await inspectStamps(out);
    expect(after.map((p) => p.imageDraws)).toEqual([0, 0, 1]);
    expect(after[0]?.content).toBe(before[0]?.content);
    expect(after[1]?.content).toBe(before[1]?.content);
    // Page 3 is A4 with /Rotate 90 (seen 841.89 x 595.28): a 420.945 x 210.4725 stamp centred at
    // seen (420.945, 297.64) = user (297.64, 420.945), drawn turned 90 in user space, so its
    // origin is the centre minus R(90)(w/2, h/2) = (297.64 + 105.236, 420.945 - 210.473).
    const placement = after[2]?.placements[0];
    expect(placement?.x).toBeCloseTo(402.876, 2);
    expect(placement?.y).toBeCloseTo(210.473, 2);
    expect(placement?.rotate).toBeCloseTo(90, 2);
    expect(placement?.width).toBeCloseTo(420.945, 2);
    expect(placement?.height).toBeCloseTo(210.473, 2);
  });

  it('embeds a PNG used by several stamps once', async () => {
    const out = await applyStamps(
      readFixture('mixed-sizes.pdf'),
      spec(imageStamp({ pages: [1] }), imageStamp({ pages: [2, 3] })),
      readPng,
    );
    const pages = await inspectStamps(out);
    expect(pages.map((p) => p.imageDraws)).toEqual([1, 1, 1]);
    expect(new Set(pages.flatMap((p) => p.imageRefs)).size).toBe(1);
  });

  it('numbers every page of a 200-page document', async () => {
    const out = await applyStamps(readFixture('two-hundred-pages.pdf'), spec(textStamp()), readPng);
    const pages = await inspectPages(out);
    expect(pages[0]?.text).toContain('Page 1 of 200');
    expect(pages[199]?.text).toContain('Page 200 of 200');
  });

  it('counts only the stamped pages, from start', async () => {
    const out = await applyStamps(
      readFixture('two-hundred-pages.pdf'),
      spec(textStamp({ pages: [6, 5, 999], start: 10 })),
      readPng,
    );
    const pages = await inspectPages(out);
    expect(pages[4]?.text).toContain('Page 10 of 11');
    expect(pages[5]?.text).toContain('Page 11 of 11');
    expect(pages[3]?.text).toBe('Page 4');
    expect(pages[6]?.text).toBe('Page 7');
  });

  it('falls back to "{n} / {total}" when the template is not WinAnsi', async () => {
    const out = await applyStamps(
      readFixture('two-hundred-pages.pdf'),
      spec(textStamp({ template: 'पृष्ठ {n}' })),
      readPng,
    );
    const pages = await inspectPages(out);
    expect(pages[0]?.text).toContain('1 / 200');
  });

  it('refuses an encrypted input', async () => {
    await expect(
      applyStamps(readFixture('protected.pdf'), spec(textStamp()), readPng),
    ).rejects.toMatchObject({ name: 'PdfToolError', kind: 'encrypted' });
  });

  it('stops between pages when cancelled', async () => {
    const controller = new AbortController();
    const onProgress = jest.fn(() => controller.abort());
    await expect(
      applyStamps(readFixture('two-hundred-pages.pdf'), spec(textStamp()), readPng, {
        signal: controller.signal,
        onProgress,
      }),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(onProgress).toHaveBeenCalledTimes(1);
  });
});
