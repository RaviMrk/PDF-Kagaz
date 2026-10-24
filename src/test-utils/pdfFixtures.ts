import fs from 'node:fs';
import path from 'node:path';

import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from '@cantoo/pdf-lib';

/** Reads a PDF fixture from `__fixtures__/` (NFC-normalised name). Node-only; for tests. */
export function readFixture(name: string): Uint8Array {
  const file = path.join(__dirname, '..', '..', '__fixtures__', name.normalize('NFC'));
  return new Uint8Array(fs.readFileSync(file));
}

/** Strictly reloads output bytes (corrupted bytes would otherwise load leniently). */
export async function loadStrict(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { throwOnInvalidObject: true, updateMetadata: false });
}

/** Per page: rounded size, rotation, and the text drawn on it (hex or literal Tj strings). */
export async function inspectPages(bytes: Uint8Array) {
  const doc = await loadStrict(bytes);
  return doc.getPages().map((page) => {
    const streams = page.node.Contents();
    const refs = streams instanceof PDFArray ? streams.asArray() : streams ? [streams] : [];
    let content = '';
    for (const ref of refs) {
      const stream = doc.context.lookup(ref);
      if (stream instanceof PDFRawStream) {
        content += Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
      }
    }
    const text = [...content.matchAll(/<([0-9a-fA-F]+)>\s*Tj|\(([^)]*)\)\s*Tj/g)]
      .map((m) => (m[1] ? Buffer.from(m[1], 'hex').toString('latin1') : (m[2] ?? '')))
      .join('');
    return {
      size: [Math.round(page.getWidth()), Math.round(page.getHeight())] as [number, number],
      rotation: page.getRotation().angle,
      text,
    };
  });
}

/** Per page: rounded size and the image XObjects in its Resources (size and first filter). */
export async function inspectImages(bytes: Uint8Array): Promise<
  {
    size: [number, number];
    images: { width: number; height: number; filter: string }[];
  }[]
> {
  const doc = await loadStrict(bytes);
  return doc.getPages().map((page) => {
    const images: { width: number; height: number; filter: string }[] = [];
    const xObjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    for (const [, ref] of xObjects?.entries() ?? []) {
      const stream = doc.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) continue;
      const dict = stream.dict;
      if (dict.lookup(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
      const filter = dict.lookup(PDFName.of('Filter'));
      const first = filter instanceof PDFArray ? filter.lookup(0) : filter;
      images.push({
        width: dict.lookup(PDFName.of('Width'), PDFNumber).asNumber(),
        height: dict.lookup(PDFName.of('Height'), PDFNumber).asNumber(),
        filter: first instanceof PDFName ? first.decodeText() : '',
      });
    }
    return {
      size: [Math.round(page.getWidth()), Math.round(page.getHeight())] as [number, number],
      images,
    };
  });
}

type Matrix = [number, number, number, number, number, number];

function multiply(m: Matrix, n: Matrix): Matrix {
  // m (new cm) applied before the current CTM n: m × n
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

const CONTENT_TOKEN = /\((?:\\.|[^\\)])*\)|<[^>]*>|\[|\]|\/[^\s/[\]()<>]+|[^\s/[\]()<>]+/g;

/**
 * Per page: the decoded content, how many image XObjects it draws (`Do`), which image objects,
 * the `/ca` of its ExtGStates, and where each image lands: the CTM at its `Do` read as a
 * placement (origin x/y, width, height, rotation in degrees counter-clockwise, 0..360).
 */
export async function inspectStamps(bytes: Uint8Array) {
  const doc = await loadStrict(bytes);
  return doc.getPages().map((page) => {
    const streams = page.node.Contents();
    const refs = streams instanceof PDFArray ? streams.asArray() : streams ? [streams] : [];
    let content = '';
    for (const ref of refs) {
      const stream = doc.context.lookup(ref);
      if (stream instanceof PDFRawStream) {
        content += Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1') + '\n';
      }
    }
    const resources = page.node.Resources();
    const xObjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    const images = new Map<string, string>();
    for (const [name, ref] of xObjects?.entries() ?? []) {
      const stream = doc.context.lookup(ref);
      if (
        stream instanceof PDFRawStream &&
        stream.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image')
      ) {
        images.set(name.asString(), ref.toString());
      }
    }
    const opacities: number[] = [];
    const states = resources?.lookupMaybe(PDFName.of('ExtGState'), PDFDict);
    for (const [, ref] of states?.entries() ?? []) {
      const state = doc.context.lookup(ref);
      const ca = state instanceof PDFDict ? state.lookup(PDFName.of('ca')) : undefined;
      if (ca instanceof PDFNumber) opacities.push(ca.asNumber());
    }
    const placements: { x: number; y: number; width: number; height: number; rotate: number }[] =
      [];
    const imageRefs: string[] = [];
    let ctm: Matrix = [1, 0, 0, 1, 0, 0];
    const stack: Matrix[] = [];
    const operands: string[] = [];
    for (const token of content.match(CONTENT_TOKEN) ?? []) {
      if (
        /^[A-Za-z'"*]+$/.test(token) &&
        token !== 'true' &&
        token !== 'false' &&
        token !== 'null'
      ) {
        if (token === 'q') stack.push(ctm);
        else if (token === 'Q') ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
        else if (token === 'cm') ctm = multiply(operands.slice(-6).map(Number) as Matrix, ctm);
        else if (token === 'Do') {
          const ref = images.get(operands[operands.length - 1] ?? '');
          if (ref !== undefined) {
            imageRefs.push(ref);
            const [a, b, c, d, e, f] = ctm;
            const rotate = ((((Math.atan2(b, a) * 180) / Math.PI) % 360) + 360) % 360;
            placements.push({
              x: e,
              y: f,
              width: Math.hypot(a, b),
              height: Math.hypot(c, d),
              rotate,
            });
          }
        }
        operands.length = 0;
      } else {
        operands.push(token);
      }
    }
    return { content, imageDraws: imageRefs.length, imageRefs, opacities, placements };
  });
}
