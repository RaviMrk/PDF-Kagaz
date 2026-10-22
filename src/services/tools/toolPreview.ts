import type { FileRow } from '@/db/schema';
import { pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';

import { JS_MAX_FILE_BYTES } from './limits';
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

/** Stages a file into its own preview workspace (for page thumbnails) and counts its pages. */
export async function openToolPreview(
  row: FileRow,
  deps: { native: PreviewNative } = { native: pdfNative },
): Promise<{ ok: true; preview: ToolPreview } | { ok: false; failure: ToolFailure }> {
  const { native } = deps;
  if (knownSize(row.sizeBytes) > JS_MAX_FILE_BYTES) return { ok: false, failure: 'tooLarge' };
  const workspace = `preview-${row.id}`;
  try {
    await native.createToolWorkspace(workspace);
    const staged = await native.stageToolInput(row.uri, workspace, 0, JS_MAX_FILE_BYTES);
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
