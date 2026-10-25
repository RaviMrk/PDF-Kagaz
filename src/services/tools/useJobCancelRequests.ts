import { useEffect, useRef } from 'react';

import { pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';
import { useToolJobs, type ToolJobsState } from '@/stores/toolJobStore';

export type JobCancelRequestDeps = {
  store: { getState(): Pick<ToolJobsState, 'active' | 'cancel'> };
  addListener: PdfNativeApi['addJobCancelRequestListener'];
};

const DEFAULT_DEPS: JobCancelRequestDeps = {
  store: useToolJobs,
  addListener: (cb) => pdfNative.addJobCancelRequestListener(cb),
};

/**
 * **Cancel** in a job's progress notification cancels that job when it is still the active one
 * (JS-route jobs stop through their AbortSignal; native ones were cancelled natively too). A
 * request for any other job is ignored. Subscribed while mounted (the app's lifetime).
 */
export function useJobCancelRequests(deps: JobCancelRequestDeps = DEFAULT_DEPS): void {
  const depsRef = useRef(deps);
  useEffect(() => {
    const { store, addListener } = depsRef.current;
    let sub: { remove(): void } | null = null;
    try {
      sub = addListener(({ jobId }) => {
        const state = store.getState();
        if (state.active?.jobId === jobId) state.cancel();
      });
    } catch {
      // No native module: jobs are still cancelled from the progress screen.
    }
    return () => sub?.remove();
  }, []);
}
