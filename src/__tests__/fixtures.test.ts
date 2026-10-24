/** @jest-environment node */
import fs from 'fs';
import path from 'path';

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  EncryptedPDFError,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
} from '@cantoo/pdf-lib';

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

  it('owner-only.pdf opens without a password but is encrypted (owner restrictions)', async () => {
    // A plain (strict) load refuses encrypted files, even with an empty user password.
    await expect(PDFDocument.load(read('owner-only.pdf'))).rejects.toThrow(EncryptedPDFError);
    const doc = await PDFDocument.load(read('owner-only.pdf'), { ignoreEncryption: true });
    expect(doc.isEncrypted).toBe(true);
    expect(doc.getPageCount()).toBe(1);
  });

  it('image-heavy.pdf has 4 pages and weighs 1-3 MB', async () => {
    const bytes = read('image-heavy.pdf');
    expect(bytes.length).toBeGreaterThan(1_048_576);
    expect(bytes.length).toBeLessThanOrEqual(3_145_728);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(4);
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

  it('outline.pdf has 10 pages and a two-level outline with page destinations', async () => {
    const doc = await PDFDocument.load(read('outline.pdf'));
    expect(doc.getPageCount()).toBe(10);
    const pageRefs = doc.getPages().map((p) => p.ref);
    const outlines = doc.catalog.lookup(PDFName.of('Outlines'), PDFDict);
    expect(outlines).toBeDefined();
    const count = (item: PDFDict) => item.lookup(PDFName.of('Count'), PDFNumber).asNumber();
    type Entry = { title: string; page: number; count?: number; children: Entry[] };
    const read1 = (first: PDFDict | undefined): Entry[] => {
      const out: Entry[] = [];
      for (let item = first; item; item = item.lookupMaybe(PDFName.of('Next'), PDFDict)) {
        const dest = item.lookup(PDFName.of('Dest'), PDFArray);
        const kids = item.lookupMaybe(PDFName.of('First'), PDFDict);
        out.push({
          title: item.lookup(PDFName.of('Title'), PDFString, PDFHexString).decodeText(),
          page: pageRefs.indexOf(dest.get(0) as PDFRef) + 1,
          ...(kids ? { count: count(item) } : {}),
          children: read1(kids),
        });
      }
      return out;
    };
    expect(count(outlines)).toBe(5);
    expect(read1(outlines.lookup(PDFName.of('First'), PDFDict))).toEqual([
      {
        title: 'Chapter 1',
        page: 1,
        count: 2,
        children: [
          { title: 'Section 1.1', page: 2, children: [] },
          { title: 'Section 1.2', page: 3, children: [] },
        ],
      },
      { title: 'Chapter 2', page: 5, children: [] },
      { title: 'Chapter 3', page: 9, children: [] },
    ]);
  });
});
