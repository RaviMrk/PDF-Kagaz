/** @jest-environment node */
import fs from 'fs';
import path from 'path';

import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from '@cantoo/pdf-lib';

const dir = path.join(__dirname, '..', '..', '__fixtures__');
const read = (name: string) => fs.readFileSync(path.join(dir, name));
const pageCount = async (name: string) => (await PDFDocument.load(read(name))).getPageCount();

describe('PDF fixtures', () => {
  it('has the expected page counts', async () => {
    expect(await pageCount('one-page.pdf')).toBe(1);
    expect(await pageCount('two-hundred-pages.pdf')).toBe(200);
    expect(await pageCount('mixed-sizes.pdf')).toBe(3);
    expect(await pageCount('अहवाल.pdf'.normalize('NFC'))).toBe(2);
  });

  it('mixed-sizes has A4 portrait, Letter landscape, rotated A4', async () => {
    const doc = await PDFDocument.load(read('mixed-sizes.pdf'));
    const pages = doc.getPages();
    const [p1, p2, p3] = [pages[0]!, pages[1]!, pages[2]!];
    expect(p1.getWidth()).toBeCloseTo(595, 0);
    expect(p1.getHeight()).toBeCloseTo(842, 0);
    expect(p2.getWidth()).toBeCloseTo(792, 0);
    expect(p2.getHeight()).toBeCloseTo(612, 0);
    expect(p3.getRotation().angle).toBe(90);
  });

  it('protected.pdf is encrypted', async () => {
    const doc = await PDFDocument.load(read('protected.pdf'), {
      ignoreEncryption: true,
    });
    expect(doc.isEncrypted).toBe(true);
  });

  it('corrupted.pdf fails to load', async () => {
    // pdf-lib parses lazily: a plain load of a truncated file resolves, so
    // use the strict parse option to surface the corruption.
    await expect(
      PDFDocument.load(read('corrupted.pdf'), { throwOnInvalidObject: true }),
    ).rejects.toThrow();
  });

  it('stores the Marathi filename as NFC', () => {
    expect(fs.readdirSync(dir)).toContain('अहवाल.pdf'.normalize('NFC'));
  });

  it('outline.pdf has 10 pages and a Chapter 1 / Chapter 2 outline', async () => {
    const doc = await PDFDocument.load(read('outline.pdf'));
    expect(doc.getPageCount()).toBe(10);
    const outlines = doc.catalog.lookup(PDFName.of('Outlines'), PDFDict);
    expect(outlines).toBeDefined();
    const title = (item: PDFDict) =>
      item.lookup(PDFName.of('Title'), PDFString, PDFHexString).decodeText();
    const first = outlines.lookup(PDFName.of('First'), PDFDict);
    expect(title(first)).toBe('Chapter 1');
    expect(title(first.lookup(PDFName.of('Next'), PDFDict))).toBe('Chapter 2');
  });
});
