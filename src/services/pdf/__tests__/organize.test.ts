/** @jest-environment node */
import { PDFDocument } from '@cantoo/pdf-lib';

import { readFixture } from '@/test-utils/pdfFixtures';

import { organizePdf } from '../organize';

describe('organizePdf', () => {
  it('reorders, deletes and rotates on top of existing rotation', async () => {
    const out = await organizePdf(readFixture('mixed-sizes.pdf'), [
      { source: 3, rotate: 90 },
      { source: 1, rotate: 0 },
      { source: 1, rotate: 270 },
    ]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([180, 0, 270]);
    expect(
      doc.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]),
    ).toEqual([
      [595, 842],
      [595, 842],
      [595, 842],
    ]);
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
    expect((await PDFDocument.load(out)).getPageCount()).toBe(10);
  });

  it('refuses encrypted input', async () => {
    await expect(
      organizePdf(readFixture('protected.pdf'), [{ source: 1, rotate: 0 }]),
    ).rejects.toMatchObject({ kind: 'encrypted' });
  });
});
