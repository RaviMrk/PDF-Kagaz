/** @jest-environment node */
import { inspectPages, readFixture } from '@/test-utils/pdfFixtures';

import { organizePdf } from '../organize';

describe('organizePdf', () => {
  it('reorders, deletes and rotates on top of existing rotation', async () => {
    const out = await organizePdf(readFixture('mixed-sizes.pdf'), [
      { source: 3, rotate: 90 },
      { source: 1, rotate: 0 },
      { source: 1, rotate: 270 },
    ]);
    const pages = await inspectPages(out);
    expect(pages.map((p) => p.rotation)).toEqual([180, 0, 270]);
    expect(pages.map((p) => p.size)).toEqual([
      [595, 842],
      [595, 842],
      [595, 842],
    ]);
    expect(pages.map((p) => p.text)).toEqual(['A4 rotated 90', 'A4 portrait', 'A4 portrait']);
  });

  it('rejects an empty page list', async () => {
    await expect(organizePdf(readFixture('one-page.pdf'), [])).rejects.toMatchObject({
      kind: 'empty',
    });
  });

  it('rejects a page outside the document', async () => {
    await expect(
      organizePdf(readFixture('mixed-sizes.pdf'), [{ source: 4, rotate: 0 }]),
    ).rejects.toMatchObject({ kind: 'badPages' });
  });

  it('reverses an outline document', async () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({ source: 10 - i, rotate: 0 as const }));
    const out = await organizePdf(readFixture('outline.pdf'), pages);
    const texts = (await inspectPages(out)).map((p) => p.text);
    expect(texts).toEqual(Array.from({ length: 10 }, (_, i) => `Outline page ${10 - i}`));
  });

  it('refuses encrypted input', async () => {
    await expect(
      organizePdf(readFixture('protected.pdf'), [{ source: 1, rotate: 0 }]),
    ).rejects.toMatchObject({ kind: 'encrypted' });
  });

  it('rejects a rotation that is not a right angle', async () => {
    await expect(
      organizePdf(readFixture('one-page.pdf'), [{ source: 1, rotate: 45 as unknown as 90 }]),
    ).rejects.toMatchObject({ kind: 'badPages' });
  });

  it('cancels when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      organizePdf(readFixture('one-page.pdf'), [{ source: 1, rotate: 0 }], {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ kind: 'cancelled' });
  });
});
