/** @jest-environment node */
import fs from 'node:fs';

import { inspectPages, readFixture } from '@/test-utils/pdfFixtures';

import { splitPdf } from '../split';

function collect() {
  const parts: Uint8Array[] = [];
  const indices: number[] = [];
  return {
    parts,
    indices,
    onPart: (index: number, bytes: Uint8Array) => {
      indices.push(index);
      parts.push(bytes);
      return Promise.resolve();
    },
  };
}

describe('splitPdf', () => {
  it('writes one part per group', async () => {
    const c = collect();
    const n = await splitPdf(readFixture('two-hundred-pages.pdf'), [[1, 2, 3], [5], [8, 9, 10]], c);
    expect(n).toBe(3);
    expect(c.indices).toEqual([0, 1, 2]);
    const texts = await Promise.all(
      c.parts.map(async (p) => (await inspectPages(p)).map((x) => x.text)),
    );
    expect(texts).toEqual([
      ['Page 1', 'Page 2', 'Page 3'],
      ['Page 5'],
      ['Page 8', 'Page 9', 'Page 10'],
    ]);
  });

  it('keeps order, size and rotation', async () => {
    const c = collect();
    await splitPdf(readFixture('mixed-sizes.pdf'), [[3, 1]], c);
    expect(c.parts).toHaveLength(1);
    const pages = await inspectPages(c.parts[0]!);
    expect(pages.map((p) => p.size)).toEqual([
      [595, 842],
      [595, 842],
    ]);
    expect(pages.map((p) => p.rotation)).toEqual([90, 0]);
    expect(pages.map((p) => p.text)).toEqual(['A4 rotated 90', 'A4 portrait']);
  });

  it('splits every 50 pages into 4 parts', async () => {
    const c = collect();
    const groups = Array.from({ length: 4 }, (_, g) =>
      Array.from({ length: 50 }, (_, i) => g * 50 + i + 1),
    );
    const n = await splitPdf(readFixture('two-hundred-pages.pdf'), groups, c);
    expect(n).toBe(4);
    for (const [g, p] of c.parts.entries()) {
      const texts = (await inspectPages(p)).map((x) => x.text);
      expect(texts).toHaveLength(50);
      expect(texts[0]).toBe(`Page ${g * 50 + 1}`);
      expect(texts[49]).toBe(`Page ${g * 50 + 50}`);
    }
  });

  it.each([[[[0]]], [[[201]]], [[[]]]])('rejects bad groups %j before writing', async (groups) => {
    const c = collect();
    await expect(splitPdf(readFixture('two-hundred-pages.pdf'), groups, c)).rejects.toMatchObject({
      kind: 'badPages',
    });
    expect(c.indices).toEqual([]);
  });

  it('rejects no groups as empty', async () => {
    await expect(splitPdf(readFixture('one-page.pdf'), [], collect())).rejects.toMatchObject({
      kind: 'empty',
    });
  });

  it('refuses encrypted input', async () => {
    await expect(splitPdf(readFixture('protected.pdf'), [[1]], collect())).rejects.toMatchObject({
      kind: 'encrypted',
    });
  });

  it('cancels before loading when already aborted', async () => {
    const c = collect();
    const controller = new AbortController();
    controller.abort();
    await expect(
      splitPdf(readFixture('outline.pdf'), [[1]], { ...c, signal: controller.signal }),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(c.indices).toEqual([]);
  });

  it('stops between parts when aborted', async () => {
    const controller = new AbortController();
    const indices: number[] = [];
    await expect(
      splitPdf(readFixture('outline.pdf'), [[1], [2], [3]], {
        signal: controller.signal,
        onPart: (i) => {
          indices.push(i);
          controller.abort();
          return Promise.resolve();
        },
      }),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(indices).toEqual([0]);
  });

  it('reports progress per part', async () => {
    const values: number[] = [];
    await splitPdf(readFixture('outline.pdf'), [[1], [2]], {
      ...collect(),
      onProgress: (f) => values.push(f),
    });
    expect(values).toEqual([0.5, 1]);
  });
});

const large = '__fixtures__/large/fifty-pages-10mb.pdf';
(fs.existsSync(large) ? describe : describe.skip)('splitPdf large fixture', () => {
  it('splits every 10 pages in under 10 s', async () => {
    const groups = Array.from({ length: 5 }, (_, g) =>
      Array.from({ length: 10 }, (_, i) => g * 10 + i + 1),
    );
    const start = Date.now();
    const n = await splitPdf(new Uint8Array(fs.readFileSync(large)), groups, collect());
    expect(Date.now() - start).toBeLessThan(10_000);
    expect(n).toBe(5);
  }, 30_000);
});
