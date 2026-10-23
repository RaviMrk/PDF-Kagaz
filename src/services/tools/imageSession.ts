import {
  isPdfNativeError,
  pdfNative,
  type ImageFilter,
  type ImportedImage,
  type PdfNativeApi,
} from '@/services/native/pdfNative';
import { newJobId } from '@/stores/toolJobStore';

import { IMAGE_MAX_BYTES, IMAGES_MAX } from './limits';

/**
 * Image sessions: the private workspace (`img-…`) holding the photos picked or pages scanned for
 * one Images to PDF or Scan flow. Screens reach these native calls only through this file.
 */

/** A session source; `key` stays stable while the user reorders or removes items. */
export type ImageItem = ImportedImage & { key: string };

export type ImageSessionDeps = {
  native: Pick<
    PdfNativeApi,
    | 'createToolWorkspace'
    | 'pickImages'
    | 'importImage'
    | 'scanDocument'
    | 'renderImageThumbnail'
    | 'cleanToolWorkspace'
  >;
};

const DEFAULT_DEPS: ImageSessionDeps = { native: pdfNative };

const item = (image: ImportedImage): ImageItem => ({ ...image, key: `i${image.index}` });

export function newImageSessionId(now = Date.now(), random = Math.random): string {
  return `img-${newJobId(now, random)}`;
}

/** Creates the session workspace, empty; false when it cannot be created. */
export async function openImageSession(
  sessionId: string,
  deps: ImageSessionDeps = DEFAULT_DEPS,
): Promise<boolean> {
  try {
    await deps.native.createToolWorkspace(sessionId);
    return true;
  } catch {
    return false;
  }
}

export type PickedImages = { items: ImageItem[]; failed: number; limited: boolean };

/**
 * Opens the photo picker for the remaining capacity and imports the picks in order, as sources
 * `current`, `current + 1`… (a failed import's index is simply never used). Picks over the limit
 * are dropped (`limited`); images that cannot be imported are counted in `failed`, never thrown.
 */
export async function addPickedImages(
  sessionId: string,
  current: number,
  deps: ImageSessionDeps = DEFAULT_DEPS,
): Promise<PickedImages> {
  const remaining = IMAGES_MAX - current;
  if (remaining <= 0) return { items: [], failed: 0, limited: true };
  let uris: string[];
  try {
    uris = await deps.native.pickImages(remaining);
  } catch {
    return { items: [], failed: 0, limited: false };
  }
  const limited = uris.length > remaining;
  const items: ImageItem[] = [];
  let failed = 0;
  for (const [k, uri] of uris.slice(0, remaining).entries()) {
    try {
      items.push(item(await deps.native.importImage(uri, sessionId, current + k, IMAGE_MAX_BYTES)));
    } catch {
      failed += 1;
    }
  }
  return { items, failed, limited };
}

export type ScannedPages =
  { ok: true; items: ImageItem[] } | { ok: false; reason: 'unavailable' | 'failed' };

/**
 * Opens the document scanner for the remaining capacity (`count` items are in the session); its
 * pages are imported as sources from `nextIndex`. A cancelled scan adds nothing.
 */
export async function addScannedPages(
  sessionId: string,
  nextIndex: number,
  count: number,
  deps: ImageSessionDeps = DEFAULT_DEPS,
): Promise<ScannedPages> {
  try {
    const pages = await deps.native.scanDocument(sessionId, nextIndex, IMAGES_MAX - count);
    return { ok: true, items: pages.map(item) };
  } catch (e) {
    return {
      ok: false,
      reason: isPdfNativeError(e, 'ERR_SCANNER_UNAVAILABLE') ? 'unavailable' : 'failed',
    };
  }
}

/** A filtered thumbnail of source `index`; null when it cannot be rendered. */
export async function imageThumbnail(
  sessionId: string,
  index: number,
  width: number,
  filter: ImageFilter,
  deps: ImageSessionDeps = DEFAULT_DEPS,
): Promise<string | null> {
  try {
    return await deps.native.renderImageThumbnail(sessionId, index, width, filter);
  } catch {
    return null;
  }
}

/** Deletes the session (the user left without starting a job); errors are ignored. */
export function discardImageSession(
  sessionId: string,
  deps: ImageSessionDeps = DEFAULT_DEPS,
): void {
  try {
    deps.native.cleanToolWorkspace(sessionId).catch(() => {});
  } catch {
    // Left for cleanupToolLeftovers at the next start.
  }
}
