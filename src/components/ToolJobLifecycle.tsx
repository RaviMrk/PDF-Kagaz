import { useJobCancelRequests } from '@/services/tools/useJobCancelRequests';
import { useToolJobLifecycle } from '@/services/tools/useToolJobLifecycle';

/**
 * Tool job startup recovery, once, and **Cancel** from the job notification for the app's lifetime;
 * render only inside the DB-ready gate.
 */
export function ToolJobLifecycle() {
  useToolJobLifecycle();
  useJobCancelRequests();
  return null;
}
