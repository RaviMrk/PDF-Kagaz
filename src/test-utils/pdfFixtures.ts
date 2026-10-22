import fs from 'node:fs';
import path from 'node:path';

/** Reads a PDF fixture from `__fixtures__/` (NFC-normalised name). Node-only; for tests. */
export function readFixture(name: string): Uint8Array {
  const file = path.join(__dirname, '..', '..', '__fixtures__', name.normalize('NFC'));
  return new Uint8Array(fs.readFileSync(file));
}
