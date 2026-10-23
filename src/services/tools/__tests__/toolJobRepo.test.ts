/**
 * @jest-environment node
 */
import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { getFile, type IndexDb } from '@/services/index/fileIndexRepo';
import { fileIdForUri } from '@/utils/fileId';

import {
  addJobOutput,
  createJob,
  failInterruptedJobs,
  finishJob,
  getJob,
  listJobs,
  recordJobOutput,
} from '../toolJobRepo';

function makeDb(): IndexDb {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = OFF');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  sqlite.pragma('foreign_keys = ON');
  return db;
}

const input = (id: string, now: number) => ({
  id,
  toolId: 'merge' as const,
  inputIds: ['x', 'y'],
  options: { name: 'm', n: 2 },
  now,
});

describe('toolJobRepo', () => {
  it('createJob stores a running job whose JSON columns round-trip', () => {
    const db = makeDb();
    const row = createJob(db, input('j1', 5));
    expect(row.status).toBe('running');
    expect(row.startedAt).toBe(5);
    const got = getJob(db, 'j1');
    expect(got?.inputIds).toEqual(['x', 'y']);
    expect(got?.options).toEqual({ name: 'm', n: 2 });
    expect(got?.outputIds).toEqual([]);
    expect(getJob(db, 'nope')).toBeUndefined();
  });

  it('finishJob records success outputs', () => {
    const db = makeDb();
    createJob(db, input('j1', 5));
    finishJob(db, 'j1', {
      status: 'succeeded',
      outputIds: ['a', 'b'],
      outputUri: 'file:///o',
      now: 9,
    });
    const got = getJob(db, 'j1');
    expect(got).toMatchObject({
      status: 'succeeded',
      outputIds: ['a', 'b'],
      outputUri: 'file:///o',
      finishedAt: 9,
    });
  });

  it('finishJob records a failure code and a cancellation', () => {
    const db = makeDb();
    createJob(db, input('j1', 5));
    createJob(db, input('j2', 6));
    finishJob(db, 'j1', { status: 'failed', error: 'encrypted', outputIds: [], now: 8 });
    finishJob(db, 'j2', { status: 'cancelled', outputIds: ['p'], now: 8 });
    expect(getJob(db, 'j1')).toMatchObject({ status: 'failed', error: 'encrypted', finishedAt: 8 });
    expect(getJob(db, 'j2')).toMatchObject({ status: 'cancelled', outputIds: ['p'] });
  });

  it('listJobs orders newest first and honours the limit', () => {
    const db = makeDb();
    createJob(db, input('old', 1));
    createJob(db, input('new', 3));
    createJob(db, input('mid', 2));
    expect(listJobs(db).map((j) => j.id)).toEqual(['new', 'mid', 'old']);
    expect(listJobs(db, 2).map((j) => j.id)).toEqual(['new', 'mid']);
  });

  it('failInterruptedJobs fails only queued/running jobs', () => {
    const db = makeDb();
    createJob(db, input('run', 1));
    createJob(db, input('done', 2));
    finishJob(db, 'done', { status: 'succeeded', outputIds: ['a'], outputUri: null, now: 3 });
    expect(failInterruptedJobs(db, 9)).toEqual(['run']);
    expect(getJob(db, 'run')).toMatchObject({
      status: 'failed',
      error: 'interrupted',
      finishedAt: 9,
    });
    expect(getJob(db, 'done')).toMatchObject({ status: 'succeeded', finishedAt: 3, error: null });
  });

  it('failInterruptedJobs also closes queued jobs', () => {
    const db = makeDb();
    createJob(db, input('q', 1));
    db.run(sql`UPDATE tool_jobs SET status = 'queued' WHERE id = 'q'`);
    expect(failInterruptedJobs(db, 4)).toEqual(['q']);
    expect(getJob(db, 'q')).toMatchObject({ status: 'failed', error: 'interrupted' });
  });

  it('failInterruptedJobs returns the changed ids newest first', () => {
    const db = makeDb();
    createJob(db, input('old', 1));
    createJob(db, input('new', 3));
    createJob(db, input('mid', 2));
    finishJob(db, 'mid', { status: 'cancelled', outputIds: [], now: 2 });
    expect(failInterruptedJobs(db, 9)).toEqual(['new', 'old']);
    expect(failInterruptedJobs(db, 10)).toEqual([]);
  });

  it('addJobOutput appends output ids to a running job as they are published', () => {
    const db = makeDb();
    createJob(db, input('j', 1));
    addJobOutput(db, 'j', 'p1');
    addJobOutput(db, 'j', 'p2');
    addJobOutput(db, 'j', 'p1');
    expect(getJob(db, 'j')?.outputIds).toEqual(['p1', 'p2']);
    failInterruptedJobs(db, 5);
    expect(getJob(db, 'j')).toMatchObject({ status: 'failed', outputIds: ['p1', 'p2'] });
  });

  it('recordJobOutput indexes a published output and records its id on the job', () => {
    const db = makeDb();
    createJob(db, input('j', 1));
    const info = {
      uri: 'content://media/external/file/9',
      name: 'x part 1.pdf',
      folder: 'Documents/PDFToolkit',
      parentUri: '',
      parentModifiedAt: 0,
      sizeBytes: 5,
      modifiedAt: 2,
    };
    recordJobOutput(db, 'j', info);
    const id = fileIdForUri(info.uri);
    expect(getJob(db, 'j')?.outputIds).toEqual([id]);
    expect(getFile(db, id)).toMatchObject({ id, name: 'x part 1.pdf', source: 'output' });
  });

  it('addJobOutput leaves closed and unknown jobs alone', () => {
    const db = makeDb();
    createJob(db, input('j', 1));
    finishJob(db, 'j', { status: 'succeeded', outputIds: ['a'], outputUri: null, now: 2 });
    addJobOutput(db, 'j', 'late');
    addJobOutput(db, 'nope', 'x');
    expect(getJob(db, 'j')?.outputIds).toEqual(['a']);
    expect(getJob(db, 'nope')).toBeUndefined();
  });

  it('addJobOutput replaces corrupt output JSON', () => {
    const db = makeDb();
    createJob(db, input('j', 1));
    db.run(sql`UPDATE tool_jobs SET output_ids = '[1' WHERE id = 'j'`);
    addJobOutput(db, 'j', 'p1');
    expect(getJob(db, 'j')?.outputIds).toEqual(['p1']);
  });

  it('finishJob does not overwrite a job that is already closed', () => {
    const db = makeDb();
    createJob(db, input('j', 1));
    failInterruptedJobs(db, 4);
    finishJob(db, 'j', { status: 'succeeded', outputIds: ['a'], outputUri: null, now: 9 });
    expect(getJob(db, 'j')).toMatchObject({
      status: 'failed',
      error: 'interrupted',
      outputIds: [],
      finishedAt: 4,
    });
  });

  it('a row with corrupt JSON columns never breaks the history (returned with fallbacks)', () => {
    const db = makeDb();
    createJob(db, input('ok', 1));
    db.run(
      sql`INSERT INTO tool_jobs (id, tool_id, input_ids, options, output_ids, status, started_at)
          VALUES ('bad', 'merge', 'not json', '{oops', '[1', 'succeeded', 2)`,
    );
    const jobs = listJobs(db);
    expect(jobs.map((j) => j.id)).toEqual(['bad', 'ok']);
    expect(jobs[0]).toMatchObject({ inputIds: [], options: {}, outputIds: [] });
    expect(jobs[1]?.inputIds).toEqual(['x', 'y']);
    expect(getJob(db, 'bad')?.status).toBe('succeeded');
  });
});
