// Generates the PDF fixtures in __fixtures__/. Run: npm run fixtures:generate
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PDFDocument, StandardFonts, degrees } from '@cantoo/pdf-lib';

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

console.log(`Fixtures written to ${outDir}`);
