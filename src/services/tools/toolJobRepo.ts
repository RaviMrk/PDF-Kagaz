import { desc, eq, inArray } from 'drizzle-orm';

import { toolJobs, type ToolJobRow } from '@/db/schema';
import type { IndexDb } from '@/services/index/fileIndexRepo';

import type { ToolId } from './toolRegistry';

/** The only values stored in `tool_jobs.error` (never file names or paths). */
export type ToolFailure =
  | 'notFound'
  | 'unavailable'
  | 'permission'
  | 'encrypted'
  | 'invalid'
  | 'tooLarge'
  | 'totalTooLarge'
  | 'tooManyPages'
  | 'badPages'
  | 'io'
  | 'cancelled'
  | 'interrupted'
  | 'unknown';

export type JobResult =
  | { status: 'succeeded'; outputIds: string[]; outputUri: string | null; now: number }
  | { status: 'failed'; error: ToolFailure; outputIds: string[]; now: number }
  | { status: 'cancelled'; outputIds: string[]; now: number };

export function createJob(
  db: IndexDb,
  input: {
    id: string;
    toolId: ToolId;
    inputIds: string[];
    options: Record<string, unknown>;
    now: number;
  },
): ToolJobRow {
  return db
    .insert(toolJobs)
    .values({
      id: input.id,
      toolId: input.toolId,
      inputIds: input.inputIds,
      options: input.options,
      status: 'running',
      startedAt: input.now,
    })
    .returning()
    .get();
}

export function finishJob(db: IndexDb, id: string, result: JobResult): void {
  const set =
    result.status === 'succeeded'
      ? {
          status: 'succeeded' as const,
          outputIds: result.outputIds,
          outputUri: result.outputUri,
          finishedAt: result.now,
        }
      : result.status === 'failed'
        ? {
            status: 'failed' as const,
            error: result.error,
            outputIds: result.outputIds,
            finishedAt: result.now,
          }
        : { status: 'cancelled' as const, outputIds: result.outputIds, finishedAt: result.now };
  db.update(toolJobs).set(set).where(eq(toolJobs.id, id)).run();
}

export function getJob(db: IndexDb, id: string): ToolJobRow | undefined {
  return db.select().from(toolJobs).where(eq(toolJobs.id, id)).get();
}

export function listJobs(db: IndexDb, limit = 20): ToolJobRow[] {
  return db.select().from(toolJobs).orderBy(desc(toolJobs.startedAt)).limit(limit).all();
}

/** Jobs left queued/running by a process death can never finish: mark them interrupted. */
export function failInterruptedJobs(db: IndexDb, now: number): number {
  return db
    .update(toolJobs)
    .set({ status: 'failed', error: 'interrupted', finishedAt: now })
    .where(inArray(toolJobs.status, ['queued', 'running']))
    .run().changes;
}
