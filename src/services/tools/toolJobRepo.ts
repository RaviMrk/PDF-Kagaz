import { and, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';

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

/**
 * The JSON columns are read as raw text and parsed per row: one corrupt row must not make the
 * whole history unreadable. A corrupt row is still returned, with [] / {} fallbacks.
 */
const { inputIds: _i, options: _o, outputIds: _p, ...plainColumns } = getTableColumns(toolJobs);
const rawSelect = {
  ...plainColumns,
  inputIds: sql<string>`${toolJobs.inputIds}`.as('input_ids_raw'),
  options: sql<string>`${toolJobs.options}`.as('options_raw'),
  outputIds: sql<string>`${toolJobs.outputIds}`.as('output_ids_raw'),
};

function parseJson<T>(raw: unknown, fallback: T, valid: (v: unknown) => boolean): T {
  try {
    const v: unknown = JSON.parse(String(raw));
    return valid(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

const isStringArray = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isObject = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);

type RawJobRow = Omit<ToolJobRow, 'inputIds' | 'options' | 'outputIds'> &
  Record<'inputIds' | 'options' | 'outputIds', unknown>;

function toRow(raw: RawJobRow): ToolJobRow {
  return {
    ...raw,
    inputIds: parseJson<string[]>(raw.inputIds, [], isStringArray),
    options: parseJson<Record<string, unknown>>(raw.options, {}, isObject),
    outputIds: parseJson<string[]>(raw.outputIds, [], isStringArray),
  };
}

function readRaw(db: IndexDb) {
  return db.select(rawSelect).from(toolJobs);
}

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
  db.insert(toolJobs)
    .values({
      id: input.id,
      toolId: input.toolId,
      inputIds: input.inputIds,
      options: input.options,
      status: 'running',
      startedAt: input.now,
    })
    .run();
  return getJob(db, input.id) as ToolJobRow;
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
  db.update(toolJobs)
    .set(set)
    .where(and(eq(toolJobs.id, id), inArray(toolJobs.status, ['queued', 'running'])))
    .run();
}

export function getJob(db: IndexDb, id: string): ToolJobRow | undefined {
  const raw = readRaw(db).where(eq(toolJobs.id, id)).get();
  return raw ? toRow(raw) : undefined;
}

export function listJobs(db: IndexDb, limit = 20): ToolJobRow[] {
  return readRaw(db).orderBy(desc(toolJobs.startedAt)).limit(limit).all().map(toRow);
}

/** Jobs left queued/running by a process death can never finish: mark them interrupted. */
export function failInterruptedJobs(db: IndexDb, now: number): number {
  return db
    .update(toolJobs)
    .set({ status: 'failed', error: 'interrupted', finishedAt: now })
    .where(inArray(toolJobs.status, ['queued', 'running']))
    .run().changes;
}
