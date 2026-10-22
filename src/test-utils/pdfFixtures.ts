import fs from 'node:fs';
import path from 'node:path';

import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from '@cantoo/pdf-lib';

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
