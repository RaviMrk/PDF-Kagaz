import { useToolJobLifecycle } from '@/services/tools/useToolJobLifecycle';

/** Tool job startup recovery, once; render only inside the DB-ready gate. */
export function ToolJobLifecycle() {
  useToolJobLifecycle();
  return null;
}
