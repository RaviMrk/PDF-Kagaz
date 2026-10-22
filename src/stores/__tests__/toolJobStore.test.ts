/** @jest-environment node */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { FileRow } from '@/db/schema';
import type { IndexDb } from '@/services/index/fileIndexRepo';
import type { ToolOutcome, ToolRequest, ToolRunDeps, runTool } from '@/services/tools/runTool';
import { createJob, finishJob, getJob } from '@/services/tools/toolJobRepo';
import { makeRow } from '@/test-utils/fileRows';

import { createToolJobStore, newJobId, optionsOf, requestFromJob } from '../toolJobStore';

const mockFiles = {
  dropMissing: jest.fn(),
  getRow: jest.fn((id: string): FileRow | null => makeRow({ name: id, id })),
  getRows: jest.fn((ids: string[]): FileRow[] => ids.map((id) => makeRow({ name: id, id }))),
};
jest.mock('@/stores/filesStore', () => ({ useFiles: { getState: () => mockFiles } }));
jest.mock('@/services/tools/toolFs', () => ({ expoToolFs: {} }));
jest.mock('@/db/client', () => ({ getDb: jest.fn() }));

function makeDb(): IndexDb {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  return db;
}

type Call = {
  jobId: string;
  request: ToolRequest;
  signal: AbortSignal;
  onProgress: (phase: 'preparing' | 'processing' | 'saving', f: number) => void;
  resolve: (o: ToolOutcome) => void;
};

function setup() {
  const db = makeDb();
  const calls: Call[] = [];
  const run = jest.fn(
    (
      jobId: string,
      request: ToolRequest,
      _deps: ToolRunDeps,
      control: Omit<Call, 'jobId' | 'request' | 'resolve'>,
    ) =>
      new Promise<ToolOutcome>((resolve) => {
        calls.push({ jobId, request, ...control, resolve });
        control.signal.addEventListener('abort', () =>
          resolve({ ok: false, failure: 'cancelled', inputIndex: null, outputs: [] }),
        );
      }),
  ) as unknown as jest.MockedFunction<typeof runTool>;
  let clock = 1_000;
  let seq = 0;
  const store = createToolJobStore({
    getDb: () => db,
    run,
    runDeps: (t) => ({ t }) as unknown as ToolRunDeps,
    now: () => clock,
    random: () => (seq++ % 97) / 97,
  });
  const advance = (ms: number) => {
    clock += ms;
  };
  return { db, calls, run, store, advance };
}

const t = (key: string) => key;
const flush = () => new Promise((r) => setImmediate(r));
const merge: ToolRequest = { toolId: 'merge', inputIds: ['a', 'b'] };

beforeEach(() => jest.clearAllMocks());

describe('toolJobStore', () => {
  it('runs one job at a time and records success', async () => {
    const s = setup();
    const started = s.store.getState().start(merge, t);
    if (!started.ok) throw new Error('expected ok');
    expect(getJob(s.db, started.jobId)?.status).toBe('running');
    expect(s.store.getState().active).toMatchObject({ jobId: started.jobId, toolId: 'merge' });
    expect(s.store.getState().start(merge, t)).toEqual({ ok: false, reason: 'busy' });
    expect(s.run).toHaveBeenCalledTimes(1);

    const out = makeRow({ name: 'm.pdf', source: 'output' });
    s.calls[0]!.resolve({ ok: true, outputs: [out] });
    await flush();
    const row = getJob(s.db, started.jobId);
    expect(row).toMatchObject({ status: 'succeeded', outputIds: [out.id], outputUri: out.uri });
    expect(s.store.getState().active).toBeNull();
    expect(s.store.getState().last).toMatchObject({ jobId: started.jobId, seen: false });
    expect(s.store.getState().last?.outcome.ok).toBe(true);
    s.store.getState().markSeen(started.jobId);
    expect(s.store.getState().last?.seen).toBe(true);
  });

  it('drops the row of a missing input only for notFound', async () => {
    const s = setup();
    s.store.getState().start(merge, t);
    s.calls[0]!.resolve({ ok: false, failure: 'notFound', inputIndex: 0, outputs: [] });
    await flush();
    expect(mockFiles.dropMissing).toHaveBeenCalledWith('a');

    mockFiles.dropMissing.mockClear();
    const second = s.store.getState().start(merge, t);
    s.calls[1]!.resolve({ ok: false, failure: 'permission', inputIndex: 1, outputs: [] });
    await flush();
    expect(mockFiles.dropMissing).not.toHaveBeenCalled();
    if (!second.ok) throw new Error('expected ok');
    expect(getJob(s.db, second.jobId)).toMatchObject({ status: 'failed', error: 'permission' });
  });

  it('cancel aborts the running job, which ends cancelled', async () => {
    const s = setup();
    const started = s.store.getState().start(merge, t);
    if (!started.ok) throw new Error('expected ok');
    s.store.getState().cancel();
    expect(s.calls[0]!.signal.aborted).toBe(true);
    await flush();
    expect(getJob(s.db, started.jobId)?.status).toBe('cancelled');
    expect(s.store.getState().active).toBeNull();
  });

  it('a cancelled job keeps the outputs published before the cancel', async () => {
    const s = setup();
    const started = s.store.getState().start(merge, t);
    if (!started.ok) throw new Error('expected ok');
    const part = makeRow({ name: 'p1.pdf', source: 'output' });
    s.calls[0]!.resolve({ ok: false, failure: 'cancelled', inputIndex: null, outputs: [part] });
    await flush();
    expect(getJob(s.db, started.jobId)).toMatchObject({
      status: 'cancelled',
      outputIds: [part.id],
    });
  });

  it('retry starts a new job with the same request', async () => {
    const s = setup();
    const split: ToolRequest = {
      toolId: 'split',
      inputIds: ['a'],
      split: { mode: 'ranges', ranges: '1-3' },
    };
    const first = s.store.getState().start(split, t);
    if (!first.ok) throw new Error('expected ok');
    expect(getJob(s.db, first.jobId)?.options).toEqual({
      split: { mode: 'ranges', ranges: '1-3' },
    });
    s.calls[0]!.resolve({ ok: false, failure: 'io', inputIndex: null, outputs: [] });
    await flush();
    const again = s.store.getState().retry(first.jobId, t);
    if (!again.ok) throw new Error('expected ok');
    expect(again.jobId).not.toBe(first.jobId);
    expect(s.calls[1]!.request).toEqual(split);
    expect(s.store.getState().retry('unknown-job', t)).toEqual({ ok: false, reason: 'busy' });
  });

  it('retry of an unknown job reports db', () => {
    const s = setup();
    expect(s.store.getState().retry('unknown-job', t)).toEqual({ ok: false, reason: 'db' });
  });

  it('reports db when the job cannot be created', () => {
    const s = setup();
    const store = createToolJobStore({
      getDb: () => {
        throw new Error('closed');
      },
      run: s.run,
      runDeps: () => ({}) as ToolRunDeps,
      now: () => 1,
      random: () => 0.5,
    });
    expect(store.getState().start(merge, t)).toEqual({ ok: false, reason: 'db' });
    expect(store.getState().active).toBeNull();
  });

  it('throttles progress to every 100 ms, except phase changes', () => {
    const s = setup();
    s.store.getState().start(merge, t);
    const { onProgress } = s.calls[0]!;
    onProgress('preparing', 0.5);
    s.advance(10);
    onProgress('preparing', 0.6);
    expect(s.store.getState().active?.fraction).toBe(0.5);
    onProgress('processing', 0.1);
    expect(s.store.getState().active).toMatchObject({ phase: 'processing', fraction: 0.1 });
    s.advance(100);
    onProgress('processing', 0.3);
    expect(s.store.getState().active?.fraction).toBe(0.3);
  });

  it('outcomeOf reads running, last and DB-only jobs', async () => {
    const s = setup();
    const started = s.store.getState().start(merge, t);
    if (!started.ok) throw new Error('expected ok');
    expect(s.store.getState().outcomeOf(started.jobId).kind).toBe('running');
    s.calls[0]!.resolve({ ok: true, outputs: [] });
    await flush();
    expect(s.store.getState().outcomeOf(started.jobId)).toMatchObject({
      kind: 'done',
      toolId: 'merge',
    });

    createJob(s.db, { id: 'old', toolId: 'merge', inputIds: ['a', 'b'], options: {}, now: 1 });
    finishJob(s.db, 'old', {
      status: 'succeeded',
      outputIds: ['o1'],
      outputUri: 'file:///o1',
      now: 2,
    });
    const old = s.store.getState().outcomeOf('old');
    expect(old).toMatchObject({ kind: 'done', toolId: 'merge', outcome: { ok: true } });
    expect(old.kind === 'done' && old.outcome.outputs.map((r) => r.id)).toEqual(['o1']);
    expect(mockFiles.getRows).toHaveBeenCalledWith(['o1']);

    createJob(s.db, { id: 'bad', toolId: 'split', inputIds: ['a'], options: {}, now: 1 });
    finishJob(s.db, 'bad', { status: 'failed', error: 'permission', outputIds: [], now: 2 });
    expect(s.store.getState().outcomeOf('bad')).toEqual({
      kind: 'done',
      toolId: 'split',
      outcome: { ok: false, failure: 'permission', inputIndex: null, outputs: [] },
    });
    expect(s.store.getState().outcomeOf('nope')).toEqual({ kind: 'missing' });
  });
});

describe('toolJobStore inputNameOf', () => {
  it('names the input at an index of the last job, else null', async () => {
    const s = setup();
    const started = s.store.getState().start(merge, t);
    if (!started.ok) throw new Error('expected ok');
    s.calls[0]!.resolve({ ok: false, failure: 'encrypted', inputIndex: 1, outputs: [] });
    await flush();
    const ids = merge.inputIds;
    expect(s.store.getState().inputNameOf(started.jobId, 1)).toBe(ids[1]);
    expect(s.store.getState().inputNameOf(started.jobId, null)).toBeNull();
    expect(s.store.getState().inputNameOf(started.jobId, 99)).toBeNull();
    expect(s.store.getState().inputNameOf('other', 0)).toBeNull();
  });
});

describe('toolJobStore helpers', () => {
  it('optionsOf stores no ids or names', () => {
    expect(optionsOf(merge)).toEqual({});
    expect(
      optionsOf({ toolId: 'split', inputIds: ['a'], split: { mode: 'everyN', n: 2 } }),
    ).toEqual({
      split: { mode: 'everyN', n: 2 },
    });
    expect(
      optionsOf({ toolId: 'organize', inputIds: ['a'], pages: [{ source: 1, rotate: 90 }] }),
    ).toEqual({ pages: [{ source: 1, rotate: 90 }] });
  });

  it('requestFromJob round-trips split and organize options', () => {
    const db = makeDb();
    const requests: ToolRequest[] = [
      merge,
      { toolId: 'split', inputIds: ['a'], split: { mode: 'ranges', ranges: '1-3' } },
      { toolId: 'split', inputIds: ['a'], split: { mode: 'everyN', n: 4 } },
      { toolId: 'split', inputIds: ['a'], split: { mode: 'extract', ranges: '2' } },
      { toolId: 'organize', inputIds: ['a'], pages: [{ source: 2, rotate: 270 }] },
    ];
    requests.forEach((req, i) => {
      createJob(db, {
        id: `j${i}`,
        toolId: req.toolId,
        inputIds: req.inputIds,
        options: optionsOf(req),
        now: 1,
      });
      expect(requestFromJob(getJob(db, `j${i}`)!)).toEqual(req);
    });
  });

  it('requestFromJob refuses malformed rows', () => {
    const db = makeDb();
    createJob(db, {
      id: 'x',
      toolId: 'split',
      inputIds: ['a'],
      options: { split: { mode: 'everyN', n: 0 } },
      now: 1,
    });
    createJob(db, { id: 'y', toolId: 'compress', inputIds: ['a'], options: {}, now: 1 });
    createJob(db, {
      id: 'z',
      toolId: 'organize',
      inputIds: ['a', 'b'],
      options: { pages: [] },
      now: 1,
    });
    expect(requestFromJob(getJob(db, 'x')!)).toBeNull();
    expect(requestFromJob(getJob(db, 'y')!)).toBeNull();
    expect(requestFromJob(getJob(db, 'z')!)).toBeNull();
  });

  it('newJobId is a safe workspace id', () => {
    const id = newJobId(1_700_000_000_000, () => 0.5);
    expect(id).toMatch(/^[a-z0-9-]{1,64}$/);
    expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]{6}$/);
  });
});
