import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ToolFs } from '@/services/tools/toolFs';

/** `file:///abs/path` → `/abs/path`; only paths under the OS temp dir are accepted (tests only). */
export function tempPathOf(fileUri: string): string {
  if (!fileUri.startsWith('file://')) throw new Error('not a file uri');
  const p = path.resolve(decodeURIComponent(fileUri.slice('file://'.length)));
  const tmp = fs.realpathSync(os.tmpdir());
  if (!p.startsWith(tmp + path.sep) && !p.startsWith(os.tmpdir() + path.sep)) {
    throw new Error('outside the temp dir');
  }
  return p;
}

/** Node `fs` implementation of ToolFs for tests: `file://` URIs map to real temp files. */
export const nodeToolFs: ToolFs = {
  async readBytes(fileUri) {
    return new Uint8Array(await fs.promises.readFile(tempPathOf(fileUri)));
  },
  async writeBytes(fileUri, bytes) {
    await fs.promises.writeFile(tempPathOf(fileUri), bytes);
  },
};

/** A fresh temp dir (realpath, so `file://` URIs built from it are stable). */
export function makeTempDir(prefix = 'tool-'): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}
