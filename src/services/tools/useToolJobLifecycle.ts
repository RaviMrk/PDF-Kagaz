import { useEffect, useRef } from 'react';

import { getDb } from '@/db/client';
import type { IndexDb } from '@/services/index/fileIndexRepo';
import { pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';
import { useToolJobs } from '@/stores/toolJobStore';

import { failInterruptedJobs } from './toolJobRepo';

/** When this JS context started: tool leftovers older than this belong to an earlier process. */
export const APP_STARTED_AT = Date.now();

export type ToolJobLifecycleDeps = {
  getDb: () => IndexDb;
  native: Pick<PdfNativeApi, 'cleanupToolLeftovers'>;
  now: () => number;
  startedAt: number;
  /** Surfaces an interrupted job (Home card, result screen). */
  recoverJob: (jobId: string) => void;
};

// Module-level: recovery runs once per process (StrictMode double effects, fast refresh, remounts).
let recovered = false;

export function resetToolJobLifecycleForTests(): void {
  recovered = false;
}

const DEFAULT_DEPS: ToolJobLifecycleDeps = {
  getDb,
  native: pdfNative,
  now: Date.now,
  startedAt: APP_STARTED_AT,
  recoverJob: (jobId) => useToolJobs.getState().recoverInterrupted(jobId),
};

/**
 * Startup recovery, once: jobs a process death left running are marked interrupted (the newest is
 * surfaced on Home) and their workspaces (and any older leftovers) deleted. Originals are never touched. Errors are ignored.
 */
export function useToolJobLifecycle(deps: ToolJobLifecycleDeps = DEFAULT_DEPS): void {
  const depsRef = useRef(deps);
  useEffect(() => {
    if (recovered) return;
    recovered = true;
    const { getDb: db, native, now, startedAt, recoverJob } = depsRef.current;
    try {
      const [newest] = failInterruptedJobs(db(), now());
      if (newest !== undefined) recoverJob(newest);
    } catch {
      // Retried at the next start.
    }
    try {
      native.cleanupToolLeftovers(startedAt).catch(() => {});
    } catch {
      // Retried at the next start.
    }
  }, []);
}
