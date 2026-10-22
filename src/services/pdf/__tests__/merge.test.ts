/** @jest-environment node */
import fs from 'node:fs';

import { inspectPages, readFixture } from '@/test-utils/pdfFixtures';

import { mergePdfs } from '../merge';

const src = (name: string) => () => Promise.resolve(readFixture(name));

async function describePages(bytes: Uint8Array) {
  const pages = await inspectPages(bytes);
  return {
    count: pages.length,
    sizes: pages.map((p) => p.size),
    rotations: pages.map((p) => p.rotation),
    texts: pages.map((p) => p.text),
  };
}

describe('mergePdfs', () => {
  it('keeps page sizes and rotation', async () => {
    const out = await mergePdfs([src('one-page.pdf'), src('mixed-sizes.pdf'), src('अहवाल.pdf')]);
    const result = await describePages(out);
    expect(result.count).toBe(6);
    expect(result.sizes).toEqual([
      [595, 842],
      [595, 842],
      [792, 612],
      [595, 842],
      [595, 842],
      [595, 842],
    ]);
    expect(result.rotations).toEqual([0, 0, 0, 90, 0, 0]);
    expect(result.texts).toEqual([
      'Hello PDF Toolkit',
      'A4 portrait',
      'Letter landscape',
      'A4 rotated 90',
      'Report page 1',
      'Report page 2',
    ]);
  });

  it('merges large page counts', async () => {
    const out = await mergePdfs([src('two-hundred-pages.pdf'), src('outline.pdf')]);
    expect((await describePages(out)).count).toBe(210);
  });

  it('refuses an encrypted source with its index', async () => {
    await expect(mergePdfs([src('one-page.pdf'), src('protected.pdf')])).rejects.toMatchObject({
      kind: 'encrypted',
      inputIndex: 1,
    });
  });

  it('refuses a corrupted source with its index', async () => {
    await expect(
      mergePdfs([src('one-page.pdf'), src('one-page.pdf'), src('corrupted.pdf')]),
    ).rejects.toMatchObject({ kind: 'invalid', inputIndex: 2 });
  });

  it('needs at least two sources', async () => {
    await expect(mergePdfs([src('one-page.pdf')])).rejects.toMatchObject({ kind: 'empty' });
  });

  it('reports strictly increasing progress ending at 1', async () => {
    const values: number[] = [];
    await mergePdfs([src('one-page.pdf'), src('outline.pdf'), src('one-page.pdf')], {
      onProgress: (f) => values.push(f),
    });
    expect(values).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it('reports the merged page count', async () => {
    const counts: number[] = [];
    await mergePdfs([src('one-page.pdf'), src('mixed-sizes.pdf'), src('अहवाल.pdf')], {
      onPageCount: (n) => counts.push(n),
    });
    expect(counts).toEqual([6]);
  });

  it('cancels when aborted during a source load', async () => {
    const controller = new AbortController();
    const first = () => {
      controller.abort();
      return Promise.resolve(readFixture('one-page.pdf'));
    };
    await expect(
      mergePdfs([first, src('outline.pdf')], { signal: controller.signal }),
    ).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('does not mutate input buffers', async () => {
    const a = readFixture('mixed-sizes.pdf');
    const b = readFixture('outline.pdf');
    const copyA = Buffer.from(a);
    const copyB = Buffer.from(b);
    await mergePdfs([() => Promise.resolve(a), () => Promise.resolve(b)]);
    expect(Buffer.compare(Buffer.from(a), copyA)).toBe(0);
    expect(Buffer.compare(Buffer.from(b), copyB)).toBe(0);
  });
});

const large = '__fixtures__/large/fifty-pages-10mb.pdf';
(fs.existsSync(large) ? describe : describe.skip)('mergePdfs large fixture', () => {
  it('merges 51 pages in under 10 s', async () => {
    const start = Date.now();
    const out = await mergePdfs([
      () => Promise.resolve(new Uint8Array(fs.readFileSync(large))),
      src('one-page.pdf'),
    ]);
    expect(Date.now() - start).toBeLessThan(10_000);
    expect((await describePages(out)).count).toBe(51);
  }, 30_000);
});
