// Generates __fixtures__/large/scanned-50mb.pdf (gitignored, too big for git): 48 A4 pages, each
// one full-page 600x600 RGB noise PNG, so the file is >= 50 MB like a large scan.
// Run: npm run fixtures:large
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { PDFDocument } from '@cantoo/pdf-lib';

const PAGES = 48;
const SIDE = 600;
const MIN_BYTES = 50_000_000;
const A4 = [595.28, 841.89];

const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '__fixtures__',
  'large',
);
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'scanned-50mb.pdf');

/** Deterministic PRNG so every run produces the same bytes. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A SIDE x SIDE 8-bit RGB PNG of random noise (incompressible, like a photo scan). */
function noisePng(random) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIDE, 0);
  ihdr.writeUInt32BE(SIDE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const row = 1 + SIDE * 3;
  const raw = Buffer.alloc(row * SIDE);
  for (let y = 0; y < SIDE; y++) {
    raw[y * row] = 0; // filter: none
    for (let x = 1; x < row; x++) raw[y * row + x] = Math.floor(random() * 256);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const doc = await PDFDocument.create({ updateMetadata: false });
doc.setCreationDate(new Date(0));
doc.setModificationDate(new Date(0));
const random = mulberry32(0x5eed);
for (let i = 0; i < PAGES; i++) {
  const image = await doc.embedPng(noisePng(random));
  const page = doc.addPage(A4);
  page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
}
const bytes = await doc.save();
fs.writeFileSync(outFile, bytes);
console.log(`${outFile}: ${bytes.length} bytes`);
if (bytes.length < MIN_BYTES) {
  console.error(`Expected at least ${MIN_BYTES} bytes`);
  process.exit(1);
}
