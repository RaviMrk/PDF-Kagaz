import { pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';
import { useFiles } from '@/stores/filesStore';
import { useToolJobs } from '@/stores/toolJobStore';

export type ClearCacheResult =
  { ok: true; bytes: number } | { ok: false; reason: 'busy' | 'failed' };

export type ClearCacheDeps = {
  native: Pick<PdfNativeApi, 'clearCaches'>;
  files: { getState: () => { resetThumbnails: () => void } };
  jobs: { getState: () => { active: unknown } };
};

/**
 * Empties thumbnails, reader copies and share copies (never tool workspaces or scans), then makes
 * the Files list regenerate its thumbnails. Refused while a tool job runs.
 */
export async function clearAppCache(
  deps: ClearCacheDeps = { native: pdfNative, files: useFiles, jobs: useToolJobs },
): Promise<ClearCacheResult> {
  if (deps.jobs.getState().active) return { ok: false, reason: 'busy' };
  let bytes: number;
  try {
    bytes = await deps.native.clearCaches();
  } catch {
    return { ok: false, reason: 'failed' };
  }
  deps.files.getState().resetThumbnails();
  return { ok: true, bytes };
}
