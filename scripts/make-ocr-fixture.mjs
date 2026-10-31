// Generates __fixtures__/scanned-text.pdf (OCR tests). Run: npm run fixtures:ocr
// macOS only: rasterises a text page with /usr/bin/sips, so it can be re-made but not on CI.
// Pages: 1 = image only; 2 = the same image on a /Rotate 90 landscape page; 3 = real text.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PDFDocument, StandardFonts, degrees, rgb } from '@cantoo/pdf-lib';

const SIPS = '/usr/bin/sips';
if (!fs.existsSync(SIPS)) {
  console.error('make-ocr-fixture: /usr/bin/sips not found (macOS only).');
  process.exit(1);
}

const outFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '__fixtures__',
  'scanned-text.pdf',
);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-fixture-'));

async function newDoc() {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  return { doc, font };
}

const LINES = [
  'Invoice 2026-118',
  'Total due 1,234.50',
  'The quick brown fox jumps over the lazy dog.',
];

// 1. A text page, rasterised.
const src = await newDoc();
const srcPage = src.doc.addPage([612, 792]);
LINES.forEach((line, i) => {
  srcPage.drawText(line, { x: 50, y: 700 - i * 60, size: 28, font: src.font, color: rgb(0, 0, 0) });
});
const tmpPdf = path.join(tmp, 'text.pdf');
const tmpPng = path.join(tmp, 'text.png');
fs.writeFileSync(tmpPdf, await src.doc.save());
execFileSync(
  SIPS,
  [
    '-s',
    'format',
    'png',
    '-s',
    'dpiHeight',
    '200',
    '-s',
    'dpiWidth',
    '200',
    '--resampleHeight',
    '2200',
    tmpPdf,
    '--out',
    tmpPng,
  ],
  { stdio: 'ignore' },
);

// 2. The scan: image pages and a real text page.
const { doc, font } = await newDoc();
const image = await doc.embedPng(fs.readFileSync(tmpPng));
doc.addPage([612, 792]).drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
// Displayed turned clockwise by 90, so the image is drawn turned counter-clockwise by 90.
const rotated = doc.addPage([792, 612]);
rotated.setRotation(degrees(90));
rotated.drawImage(image, { x: 792, y: 0, width: 612, height: 792, rotate: degrees(90) });
const text = doc.addPage([612, 792]);
LINES.forEach((line, i) => text.drawText(line, { x: 50, y: 700 - i * 60, size: 20, font }));

fs.writeFileSync(outFile, await doc.save());
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${path.relative(process.cwd(), outFile)}`);
