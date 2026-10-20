import type { StorageMode } from './StorageProvider';

export type ResolveDeps = {
  hasAllFilesAccess: () => Promise<boolean>;
  grantedRootCount: () => Promise<number>;
};

/** Full access wins, then SAF with at least one granted root, else 'none'. */
export async function resolveStorageMode(deps: ResolveDeps): Promise<StorageMode | 'none'> {
  const full = await deps.hasAllFilesAccess().catch(() => false);
  if (full) return 'full';
  const count = await deps.grantedRootCount().catch(() => 0);
  return count >= 1 ? 'saf' : 'none';
}
