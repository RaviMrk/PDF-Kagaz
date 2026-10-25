import type { FileRow } from '@/db/schema';
import {
  isPdfNativeError,
  pdfNative,
  type PdfLock,
  type PdfNativeApi,
} from '@/services/native/pdfNative';

import { NATIVE_CAPS, routeFor } from './limits';
import { knownSize, toToolFailure } from './toolFailure';
import type { ToolFailure } from './toolJobRepo';
import type { RunnableToolId } from './toolRegistry';

export type ToolPreview = { fileUri: string; pageCount: number; close(): void };

type PreviewNative = Pick<
  PdfNativeApi,
  | 'createToolWorkspace'
  | 'stageToolInput'
  | 'getToolPageCount'
  | 'releaseToolDocument'
  | 'cleanToolWorkspace'
  | 'inspectPdf'
  | 'unlockToolInput'
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
  /** The input's password, to decrypt a locked input; never stored or logged. */
  password?: string | null;
  /** Staging cap; default NATIVE_CAPS.file. */
  maxBytes?: number;
  /**
   * The tool the preview is for. A file PdfBox cannot open is still previewed (with pdfium) when
   * this tool would run it on pdf-lib (routed, under the JS caps): pdf-lib may open it.
   */
  toolId?: RunnableToolId;
};

export type ToolPreviewResult =
  | { ok: true; preview: ToolPreview }
  /** `lock`: set for a locked file (a failed unlock: which password it needs). */
  | { ok: false; failure: ToolFailure; lock?: PdfLock };

/**
 * Stages a file into its own preview workspace (for page thumbnails) and counts its pages. A
 * locked file is decrypted there first (with `opts.password`; null tries the empty one) and the
 * pages are counted on the decrypted copy. A file PdfBox rejects is counted as it is when
 * `opts.toolId` would run it on pdf-lib.
 */
export async function openToolPreview(
  row: FileRow,
  opts: ToolPreviewOptions = {},
  deps: { native: PreviewNative } = { native: pdfNative },
): Promise<ToolPreviewResult> {
  const { native } = deps;
  const maxBytes = opts.maxBytes ?? NATIVE_CAPS.file;
  if (knownSize(row.sizeBytes) > maxBytes) return { ok: false, failure: 'tooLarge' };
  const workspace = `preview-${row.id}`;
  let lock: PdfLock | undefined;
  try {
    await native.createToolWorkspace(workspace);
    const staged = await native.stageToolInput(row.uri, workspace, 0, maxBytes);
    try {
      lock = await native.inspectPdf(staged.uri);
    } catch (e) {
      const jsRoute =
        opts.toolId !== undefined && routeFor(opts.toolId, [staged.sizeBytes]) === 'js';
      if (!(jsRoute && isPdfNativeError(e, 'ERR_PDF_INVALID'))) throw e;
      lock = 'none';
    }
    const file =
      lock === 'none'
        ? staged
        : await native.unlockToolInput(staged.uri, workspace, 0, opts.password ?? null);
    const pageCount = await native.getToolPageCount(file.uri);
    let closed = false;
    return {
      ok: true,
      preview: {
        fileUri: file.uri,
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
    const failure = toToolFailure(e);
    return lock === undefined || lock === 'none'
      ? { ok: false, failure }
      : { ok: false, failure, lock };
  }
}
