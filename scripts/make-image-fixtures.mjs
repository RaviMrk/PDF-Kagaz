// Generates the image fixtures in __fixtures__/images/. Run: npm run fixtures:images (macOS: needs /usr/bin/sips)
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const SIPS = '/usr/bin/sips';
if (!fs.existsSync(SIPS)) {
  console.error('make-image-fixtures: /usr/bin/sips not found (macOS only).');
  process.exit(1);
}

const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '__fixtures__',
  'images',
);
fs.mkdirSync(outDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'img-fixtures-'));

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, crc]);
}

/** Encodes RGBA pixels from pixel(x, y) -> [r, g, b, a] as a PNG. */
function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw.set([r, g, b, a], row + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function toJpeg(pngBytes, name) {
  const src = path.join(tmp, `${name}.png`);
  const dst = path.join(tmp, `${name}.jpg`);
  fs.writeFileSync(src, pngBytes);
  execFileSync(SIPS, ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', src, '--out', dst], {
    stdio: 'ignore',
  });
  return fs.readFileSync(dst);
}

const RED = [220, 30, 30, 255];
const BLUE = [30, 30, 220, 255];
const WHITE = [255, 255, 255, 255];
const BLACK = [0, 0, 0, 255];
const halves = (w) => (x) => (x < w / 2 ? RED : BLUE);

/** Right-pointing arrow on white: shaft plus head. */
function arrow(w, h) {
  return (x, y) => {
    const cy = h / 2;
    const shaft = x > w * 0.1 && x < w * 0.6 && Math.abs(y - cy) < h * 0.12;
    const head =
      x >= w * 0.6 && x < w * 0.9 && Math.abs(y - cy) < ((w * 0.9 - x) / (w * 0.3)) * h * 0.3;
    return shaft || head ? BLACK : WHITE;
  };
}

/**
 * The JPEG without its APP1 (EXIF/XMP) segments. sips writes its own big-endian EXIF APP1; left in
 * next to ours, readers such as Android's ExifInterface pick the wrong one.
 */
function withoutApp1(jpeg) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a JPEG');
  const kept = [jpeg.subarray(0, 2)];
  let at = 2;
  for (;;) {
    if (jpeg[at] !== 0xff) throw new Error('bad JPEG marker');
    const marker = jpeg[at + 1];
    // SOS: entropy-coded data follows; everything from here on is kept as is.
    if (marker === 0xda) break;
    const end = at + 2 + jpeg.readUInt16BE(at + 2);
    if (marker !== 0xe1) kept.push(jpeg.subarray(at, end));
    at = end;
  }
  kept.push(jpeg.subarray(at));
  return Buffer.concat(kept);
}

/** Replaces any APP1 segments with one EXIF APP1 (IFD0 with only Orientation) right after SOI. */
function withOrientation(source, orientation) {
  const jpeg = withoutApp1(source);
  const tiff = Buffer.alloc(8 + 2 + 12 + 4);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8); // one entry
  tiff.writeUInt16LE(0x0112, 10); // tag Orientation
  tiff.writeUInt16LE(3, 12); // type SHORT
  tiff.writeUInt32LE(1, 14); // count
  tiff.writeUInt16LE(orientation, 18); // value
  tiff.writeUInt32LE(0, 22); // no next IFD
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a JPEG');
  return Buffer.concat([jpeg.subarray(0, 2), header, payload, jpeg.subarray(2)]);
}

const files = {
  'landscape-400x300.jpg': toJpeg(
    png(400, 300, (x) => halves(400)(x)),
    'landscape',
  ),
  'portrait-300x400.jpg': toJpeg(
    png(300, 400, (x) => halves(300)(x)),
    'portrait',
  ),
  'exif-rotate-90.jpg': withOrientation(toJpeg(png(400, 300, arrow(400, 300)), 'exif'), 6),
  'alpha-200x100.png': png(200, 100, (x) => (x < 100 ? [0, 0, 0, 0] : [0, 200, 0, 255])),
  'not-an-image.jpg': Buffer.from('this is not an image\n'.repeat(4)).subarray(0, 64),
};

for (const [name, bytes] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), bytes);
  console.log(`${name}: ${bytes.length} bytes`);
}
fs.rmSync(tmp, { recursive: true, force: true });
