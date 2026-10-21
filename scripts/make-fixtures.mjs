// Generates the PDF fixtures in __fixtures__/. Run: npm run fixtures:generate
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PDFArray,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNull,
  StandardFonts,
  degrees,
} from '@cantoo/pdf-lib';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');
fs.mkdirSync(outDir, { recursive: true });

const A4 = [595.28, 841.89];
const LETTER_LANDSCAPE = [792, 612];

async function newDoc() {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  return { doc, font };
}

function addTextPage(doc, font, text, size = A4) {
  const page = doc.addPage(size);
  page.drawText(text, { x: 50, y: page.getHeight() - 80, size: 24, font });
  return page;
}

function write(name, bytes) {
  fs.writeFileSync(path.join(outDir, name.normalize('NFC')), bytes);
}

// one-page.pdf
const one = await newDoc();
addTextPage(one.doc, one.font, 'Hello PDF Toolkit');
const onePageBytes = await one.doc.save();
write('one-page.pdf', onePageBytes);

// two-hundred-pages.pdf
const many = await newDoc();
for (let i = 1; i <= 200; i++) addTextPage(many.doc, many.font, `Page ${i}`);
write('two-hundred-pages.pdf', await many.doc.save());

// protected.pdf
const prot = await newDoc();
addTextPage(prot.doc, prot.font, 'Protected');
prot.doc.encrypt({ userPassword: 'secret', ownerPassword: 'owner' });
write('protected.pdf', await prot.doc.save());

// mixed-sizes.pdf
const mixed = await newDoc();
addTextPage(mixed.doc, mixed.font, 'A4 portrait', A4);
addTextPage(mixed.doc, mixed.font, 'Letter landscape', LETTER_LANDSCAPE);
addTextPage(mixed.doc, mixed.font, 'A4 rotated 90', A4).setRotation(degrees(90));
write('mixed-sizes.pdf', await mixed.doc.save());

// corrupted.pdf: truncated one-page.pdf
write('corrupted.pdf', onePageBytes.slice(0, 400));

// Marathi-named fixture (content is Latin: standard fonts have no Devanagari)
const mr = await newDoc();
addTextPage(mr.doc, mr.font, 'Report page 1');
addTextPage(mr.doc, mr.font, 'Report page 2');
write('अहवाल.pdf', await mr.doc.save());

// outline.pdf: 10 pages with a two-level outline (bookmarks), built from low-level objects
// because pdf-lib has no outline API. Each item jumps with /Dest [pageRef /XYZ null null null].
const outlined = await newDoc();
for (let i = 1; i <= 10; i++) addTextPage(outlined.doc, outlined.font, `Outline page ${i}`);
addOutline(outlined.doc, [
  {
    title: 'Chapter 1',
    page: 1,
    children: [
      { title: 'Section 1.1', page: 2 },
      { title: 'Section 1.2', page: 3 },
    ],
  },
  { title: 'Chapter 2', page: 5 },
  { title: 'Chapter 3', page: 9 },
]);
write('outline.pdf', await outlined.doc.save());

/** Adds `items` ({ title, page (1-based), children? }) as the document outline. */
function addOutline(doc, items) {
  const { context } = doc;
  const pages = doc.getPages();
  const root = context.obj({ Type: 'Outlines' });
  const rootRef = context.register(root);
  linkItems(root, rootRef, items);
  doc.catalog.set(PDFName.of('Outlines'), rootRef);

  function linkItems(parent, parentRef, list) {
    const refs = list.map(() => context.nextRef());
    let visible = list.length;
    list.forEach((item, i) => {
      const dest = PDFArray.withContext(context);
      dest.push(pages[item.page - 1].ref);
      dest.push(PDFName.of('XYZ'));
      dest.push(PDFNull);
      dest.push(PDFNull);
      dest.push(PDFNull);
      const dict = context.obj({});
      dict.set(PDFName.of('Title'), PDFHexString.fromText(item.title));
      dict.set(PDFName.of('Parent'), parentRef);
      dict.set(PDFName.of('Dest'), dest);
      if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1]);
      if (i < list.length - 1) dict.set(PDFName.of('Next'), refs[i + 1]);
      if (item.children?.length) visible += linkItems(dict, refs[i], item.children);
      context.assign(refs[i], dict);
    });
    parent.set(PDFName.of('First'), refs[0]);
    parent.set(PDFName.of('Last'), refs[refs.length - 1]);
    // /Count = visible descendants (all items open)
    parent.set(PDFName.of('Count'), context.obj(visible));
    return visible;
  }
}

console.log(`Fixtures written to ${outDir}`);
