import type { FileRow } from '@/db/schema';
import { pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';

import { NATIVE_CAPS } from './limits';
import { knownSize, toToolFailure } from './toolFailure';
import type { ToolFailure } from './toolJobRepo';

export type ToolPreview = { fileUri: string; pageCount: number; close(): void };

type PreviewNative = Pick<
  PdfNativeApi,
  | 'createToolWorkspace'
  | 'stageToolInput'
  | 'getToolPageCount'
  | 'releaseToolDocument'
  | 'cleanToolWorkspace'
>;

/** Best-effort native call: never throws, synchronously or not. */
function quietly(fn: () => Promise<unknown>): void {
  try {
    fn().catch(() => {});
  } catch {
    // Ignored: cleanup is retried by cleanupToolLeftovers at the next start.
  }
}

export type ToolPreviewOptions = {
  /** The input's password (Task 3 opens locked inputs with it); never stored or logged. */
  password?: string | null;
  /** Staging cap; default NATIVE_CAPS.file. */
  maxBytes?: number;
};

/** Stages a file into its own preview workspace (for page thumbnails) and counts its pages. */
export async function openToolPreview(
  row: FileRow,
  opts: ToolPreviewOptions = {},
  deps: { native: PreviewNative } = { native: pdfNative },
): Promise<{ ok: true; preview: ToolPreview } | { ok: false; failure: ToolFailure }> {
  const { native } = deps;
  const maxBytes = opts.maxBytes ?? NATIVE_CAPS.file;
  if (knownSize(row.sizeBytes) > maxBytes) return { ok: false, failure: 'tooLarge' };
  const workspace = `preview-${row.id}`;
  try {
    await native.createToolWorkspace(workspace);
    const staged = await native.stageToolInput(row.uri, workspace, 0, maxBytes);
    const pageCount = await native.getToolPageCount(staged.uri);
    let closed = false;
    return {
      ok: true,
      preview: {
        fileUri: staged.uri,
        pageCount,
        close() {
          if (closed) return;
          closed = true;
          quietly(() => native.releaseToolDocument());
          quietly(() => native.cleanToolWorkspace(workspace));
        },
      },
    };
  } catch (e) {
    quietly(() => native.cleanToolWorkspace(workspace));
    return { ok: false, failure: toToolFailure(e) };
  }
}
