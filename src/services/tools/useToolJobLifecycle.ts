import { useEffect, useRef } from 'react';

import { getDb } from '@/db/client';
import type { IndexDb } from '@/services/index/fileIndexRepo';
import { pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';

import { failInterruptedJobs } from './toolJobRepo';

/** When this JS context started: tool leftovers older than this belong to an earlier process. */
export const APP_STARTED_AT = Date.now();

export type ToolJobLifecycleDeps = {
  getDb: () => IndexDb;
  native: Pick<PdfNativeApi, 'cleanupToolLeftovers'>;
  now: () => number;
  startedAt: number;
};

const DEFAULT_DEPS: ToolJobLifecycleDeps = {
  getDb,
  native: pdfNative,
  now: Date.now,
  startedAt: APP_STARTED_AT,
};

/**
 * Startup recovery, once: jobs a process death left running are marked interrupted and their
 * workspaces (and any older leftovers) deleted. Originals are never touched. Errors are ignored.
 */
export function useToolJobLifecycle(deps: ToolJobLifecycleDeps = DEFAULT_DEPS): void {
  const depsRef = useRef(deps);
  useEffect(() => {
    const { getDb: db, native, now, startedAt } = depsRef.current;
    try {
      failInterruptedJobs(db(), now());
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
