import { useFileIndexLifecycle } from '@/services/files/useFileIndexLifecycle';

/** Mounts the file-index lifecycle once; render only inside the DB-ready gate. */
export function IndexLifecycle() {
  useFileIndexLifecycle();
  return null;
}
