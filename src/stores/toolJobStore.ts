import { create } from 'zustand';

import { getDb } from '@/db/client';
import type { ToolJobRow } from '@/db/schema';
import type { IndexDb } from '@/services/index/fileIndexRepo';
import { pdfNative } from '@/services/native/pdfNative';
import type { PageEdit } from '@/services/pdf/organize';
import type { Translate } from '@/services/tools/outputNames';
import {
  runTool,
  type SplitOptions,
  type ToolOutcome,
  type ToolPhase,
  type ToolRequest,
  type ToolRunDeps,
} from '@/services/tools/runTool';
import { expoToolFs } from '@/services/tools/toolFs';
import {
  createJob,
  finishJob,
  getJob,
  recordJobOutput,
  type JobResult,
  type ToolFailure,
} from '@/services/tools/toolJobRepo';
import type { RunnableToolId } from '@/services/tools/toolRegistry';
import { useFiles } from '@/stores/filesStore';

export type ActiveJob = {
  jobId: string;
  toolId: RunnableToolId;
  phase: ToolPhase;
  fraction: number;
};
export type FinishedJob = {
  jobId: string;
  toolId: RunnableToolId;
  inputIds: string[];
  outcome: ToolOutcome;
  seen: boolean;
  /** Interrupted by a process death and loaded from its row: outcomeOf re-reads the row. */
  recovered?: true;
};
export type StartResult = { ok: true; jobId: string } | { ok: false; reason: 'busy' | 'db' };
export type JobView =
  | { kind: 'running'; job: ActiveJob }
  | { kind: 'done'; toolId: RunnableToolId; outcome: ToolOutcome }
  | { kind: 'missing' };

export type ToolJobsState = {
  active: ActiveJob | null;
  last: FinishedJob | null;
  /** `t` is the caller's useTranslation().t (output names); one job at a time. */
  start(request: ToolRequest, t: Translate): StartResult;
  cancel(): void;
  retry(jobId: string, t: Translate): StartResult;
  outcomeOf(jobId: string): JobView;
  markSeen(jobId: string): void;
  /**
   * Startup only: surfaces a job a process death interrupted (Home card, result screen). Never
   * replaces a job of this process. Errors are ignored.
   */
  recoverInterrupted(jobId: string): void;
  /** Name of the input a failure points at (this process's last job only); null when unknown. */
  inputNameOf(jobId: string, inputIndex: number | null): string | null;
};

export type ToolJobStoreDeps = {
  getDb: () => IndexDb;
  run: typeof runTool;
  /** Everything but recordOutput, which the store writes to the job row itself. */
  runDeps: (t: Translate) => Omit<ToolRunDeps, 'recordOutput'>;
  now: () => number;
  random: () => number;
};

const PROGRESS_INTERVAL_MS = 100;

const FAILURES: readonly ToolFailure[] = [
  'notFound',
  'unavailable',
  'permission',
  'encrypted',
  'invalid',
  'tooLarge',
  'totalTooLarge',
  'tooManyPages',
  'badPages',
  'io',
  'cancelled',
  'interrupted',
  'unknown',
];

/** Options stored with a job: no ids or names. */
export function optionsOf(request: ToolRequest): Record<string, unknown> {
  if (request.toolId === 'split') return { split: request.split };
  if (request.toolId === 'organize') return { pages: request.pages };
  return {};
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function splitFrom(v: unknown): SplitOptions | null {
  if (!isRecord(v)) return null;
  if ((v.mode === 'ranges' || v.mode === 'extract') && typeof v.ranges === 'string') {
    return { mode: v.mode, ranges: v.ranges };
  }
  if (v.mode === 'everyN' && Number.isInteger(v.n) && (v.n as number) >= 1) {
    return { mode: 'everyN', n: v.n as number };
  }
  return null;
}

function pagesFrom(v: unknown): PageEdit[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const pages: PageEdit[] = [];
  for (const p of v) {
    if (!isRecord(p) || !Number.isInteger(p.source) || (p.source as number) < 1) return null;
    if (p.rotate !== 0 && p.rotate !== 90 && p.rotate !== 180 && p.rotate !== 270) return null;
    pages.push({ source: p.source as number, rotate: p.rotate });
  }
  return pages;
}

/** The request a stored job ran with; null for a row that cannot be run again. */
export function requestFromJob(row: ToolJobRow): ToolRequest | null {
  const ids = row.inputIds;
  if (row.toolId === 'merge')
    return ids.length >= 2 ? { toolId: 'merge', inputIds: [...ids] } : null;
  const [only] = ids;
  if (ids.length !== 1 || only === undefined) return null;
  if (row.toolId === 'split') {
    const split = splitFrom(row.options.split);
    return split ? { toolId: 'split', inputIds: [only], split } : null;
  }
  if (row.toolId === 'organize') {
    const pages = pagesFrom(row.options.pages);
    return pages ? { toolId: 'organize', inputIds: [only], pages } : null;
  }
  return null;
}

/** Job ids are also workspace directory names: `[a-z0-9-]` only. */
export function newJobId(now: number, random: () => number): string {
  const n = Math.min(36 ** 6 - 1, Math.max(0, Math.floor(random() * 36 ** 6)));
  return `${Math.max(0, Math.floor(now)).toString(36)}-${n.toString(36).padStart(6, '0')}`;
}

function runnable(toolId: string): RunnableToolId | null {
  return toolId === 'merge' || toolId === 'split' || toolId === 'organize' ? toolId : null;
}

function resultOf(outcome: ToolOutcome, now: number): JobResult {
  const outputIds = outcome.outputs.map((r) => r.id);
  if (outcome.ok) {
    return { status: 'succeeded', outputIds, outputUri: outcome.outputs[0]?.uri ?? null, now };
  }
  if (outcome.failure === 'cancelled') return { status: 'cancelled', outputIds, now };
  return { status: 'failed', error: outcome.failure, outputIds, now };
}

export function createToolJobStore(deps: ToolJobStoreDeps) {
  return create<ToolJobsState>()((set, get) => {
    let controller: AbortController | null = null;

    function finish(jobId: string, request: ToolRequest, outcome: ToolOutcome) {
      try {
        finishJob(deps.getDb(), jobId, resultOf(outcome, deps.now()));
      } catch {
        // The row stays running and is marked interrupted at the next start.
      }
      // Only a confirmed missing input drops its row; other failures keep it.
      if (!outcome.ok && outcome.failure === 'notFound' && outcome.inputIndex !== null) {
        const id = request.inputIds[outcome.inputIndex];
        if (id !== undefined) useFiles.getState().dropMissing(id);
      }
      controller = null;
      set({
        active: null,
        last: {
          jobId,
          toolId: request.toolId,
          inputIds: [...request.inputIds],
          outcome,
          seen: false,
        },
      });
    }

    function start(request: ToolRequest, t: Translate): StartResult {
      if (get().active) return { ok: false, reason: 'busy' };
      const jobId = newJobId(deps.now(), deps.random);
      try {
        createJob(deps.getDb(), {
          id: jobId,
          toolId: request.toolId,
          inputIds: request.inputIds,
          options: optionsOf(request),
          now: deps.now(),
        });
      } catch {
        return { ok: false, reason: 'db' };
      }
      const ac = new AbortController();
      controller = ac;
      set({ active: { jobId, toolId: request.toolId, phase: 'preparing', fraction: 0 } });

      let appliedAt = Number.NEGATIVE_INFINITY;
      const onProgress = (phase: ToolPhase, fraction: number) => {
        const active = get().active;
        if (active?.jobId !== jobId) return;
        const now = deps.now();
        if (phase === active.phase && now - appliedAt < PROGRESS_INTERVAL_MS) return;
        appliedAt = now;
        set({ active: { ...active, phase, fraction } });
      };

      // Started synchronously: picked documents carry a transient grant, so staging must not wait.
      void (async () => {
        let outcome: ToolOutcome;
        try {
          const runDeps: ToolRunDeps = {
            ...deps.runDeps(t),
            recordOutput: (id, info) => recordJobOutput(deps.getDb(), id, info),
          };
          outcome = await deps.run(jobId, request, runDeps, {
            signal: ac.signal,
            onProgress,
          });
        } catch {
          outcome = { ok: false, failure: 'unknown', inputIndex: null, outputs: [] };
        }
        finish(jobId, request, outcome);
      })();
      return { ok: true, jobId };
    }

    return {
      active: null,
      last: null,
      start,

      cancel() {
        controller?.abort();
      },

      retry(jobId, t) {
        if (get().active) return { ok: false, reason: 'busy' };
        let request: ToolRequest | null = null;
        try {
          const row = getJob(deps.getDb(), jobId);
          request = row ? requestFromJob(row) : null;
        } catch {
          request = null;
        }
        return request ? start(request, t) : { ok: false, reason: 'db' };
      },

      outcomeOf(jobId) {
        const { active, last } = get();
        if (active?.jobId === jobId) return { kind: 'running', job: active };
        if (last?.jobId === jobId && !last.recovered)
          return { kind: 'done', toolId: last.toolId, outcome: last.outcome };
        let row: ToolJobRow | undefined;
        try {
          row = getJob(deps.getDb(), jobId);
        } catch {
          return { kind: 'missing' };
        }
        const toolId = row ? runnable(row.toolId) : null;
        if (!row || !toolId) return { kind: 'missing' };
        const outputs = useFiles.getState().getRows(row.outputIds);
        if (row.status === 'succeeded')
          return { kind: 'done', toolId, outcome: { ok: true, outputs } };
        // Not running in this process: a queued/running row was interrupted by a process death.
        const failure: ToolFailure =
          row.status === 'cancelled'
            ? 'cancelled'
            : row.status === 'failed'
              ? (FAILURES.find((f) => f === row.error) ?? 'unknown')
              : 'interrupted';
        return { kind: 'done', toolId, outcome: { ok: false, failure, inputIndex: null, outputs } };
      },

      inputNameOf(jobId, inputIndex) {
        const { last } = get();
        if (inputIndex === null || last?.jobId !== jobId) return null;
        const id = last.inputIds[inputIndex];
        return id === undefined ? null : (useFiles.getState().getRow(id)?.name ?? null);
      },

      recoverInterrupted(jobId) {
        if (get().active || get().last) return;
        let row: ToolJobRow | undefined;
        try {
          row = getJob(deps.getDb(), jobId);
        } catch {
          return;
        }
        const toolId = row ? runnable(row.toolId) : null;
        if (!row || !toolId) return;
        set({
          last: {
            jobId,
            toolId,
            inputIds: [...row.inputIds],
            outcome: {
              ok: false,
              failure: 'interrupted',
              inputIndex: null,
              outputs: useFiles.getState().getRows(row.outputIds),
            },
            seen: false,
            recovered: true,
          },
        });
      },

      markSeen(jobId) {
        const { last } = get();
        if (last?.jobId === jobId && !last.seen) set({ last: { ...last, seen: true } });
      },
    };
  });
}

export const useToolJobs = createToolJobStore({
  getDb,
  run: runTool,
  runDeps: (t) => ({
    native: pdfNative,
    fs: expoToolFs,
    getRows: (ids) => useFiles.getState().getRows(ids),
    registerOutputs: (infos) => useFiles.getState().registerOutputs(infos),
    t,
    now: Date.now,
  }),
  now: Date.now,
  random: Math.random,
});
