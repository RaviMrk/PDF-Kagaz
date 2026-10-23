/** @jest-environment node */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { FileRow } from '@/db/schema';
import type { IndexDb } from '@/services/index/fileIndexRepo';
import type {
  ImagesRequest,
  ToolOutcome,
  ToolRequest,
  ToolRunDeps,
  runTool,
} from '@/services/tools/runTool';
import {
  addJobOutput,
  createJob,
  failInterruptedJobs,
  finishJob,
  getJob,
} from '@/services/tools/toolJobRepo';
import { getFile } from '@/services/index/fileIndexRepo';
import type { PdfFileInfo } from '@/services/native/pdfNative';
import { fileIdForUri } from '@/utils/fileId';
import { makeRow } from '@/test-utils/fileRows';

import {
  createToolJobStore,
  newJobId,
  optionsOf,
  requestFromJob,
  type ToolJobStoreDeps,
} from '../toolJobStore';

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

function setup(db: IndexDb = makeDb(), extra: Partial<ToolJobStoreDeps> = {}) {
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
  const cleanSession = jest.fn((_sessionId: string) => Promise.resolve());
  const store = createToolJobStore({
    getDb: () => db,
    run,
    runDeps: (t) => ({ t }) as unknown as ToolRunDeps,
    now: () => clock,
    random: () => (seq++ % 97) / 97,
    cleanSession,
    ...extra,
  });
  const advance = (ms: number) => {
    clock += ms;
  };
  return { db, calls, run, store, advance, cleanSession };
}

const t = (key: string) => key;
const outputInfo = (uri: string, name: string): PdfFileInfo => ({
  uri,
  name,
  folder: 'Documents/PDFToolkit',
  parentUri: '',
  parentModifiedAt: 0,
  sizeBytes: 10,
  modifiedAt: 1,
});
const flush = () => new Promise((r) => setImmediate(r));
const merge: ToolRequest = { toolId: 'merge', inputIds: ['a', 'b'] };
const imagesReq: ImagesRequest = {
  toolId: 'images-to-pdf',
  inputIds: [],
  sessionId: 'img-s1',
  images: [2, 0, 1],
  filter: 'greyscale',
  layout: { pageSize: 'a4', orientation: 'auto', margin: 'small' },
  name: 'Receipt',
  quality: 'standard',
};

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

  it('reports each finished job once with its request, outcome and duration', async () => {
    const onJobFinished = jest.fn();
    const s = setup(undefined, { onJobFinished });
    s.store.getState().start(merge, t);
    s.advance(1_349);
    const outcome: ToolOutcome = { ok: false, failure: 'notFound', inputIndex: 0, outputs: [] };
    s.calls[0]!.resolve(outcome);
    await flush();
    expect(onJobFinished).toHaveBeenCalledTimes(1);
    expect(onJobFinished).toHaveBeenCalledWith(merge, outcome, 1_349);
  });

  it('a throwing onJobFinished does not break the finished job', async () => {
    const onJobFinished = jest.fn(() => {
      throw new Error('telemetry');
    });
    const s = setup(undefined, { onJobFinished });
    const started = s.store.getState().start(merge, t);
    if (!started.ok) throw new Error('expected ok');
    s.calls[0]!.resolve({ ok: true, outputs: [] });
    await flush();
    expect(onJobFinished).toHaveBeenCalledTimes(1);
    expect(s.store.getState().last).toMatchObject({ jobId: started.jobId, seen: false });
    expect(s.store.getState().active).toBeNull();
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
      cleanSession: jest.fn(),
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

describe('toolJobStore recovery', () => {
  it('records each published output on the running job row and indexes it', () => {
    const s = setup();
    const started = s.store.getState().start(merge, t);
    if (!started.ok) throw new Error('expected ok');
    const runDeps = s.run.mock.calls[0]![2];
    const info = outputInfo('content://media/external/file/77', 'a part 1.pdf');
    runDeps.recordOutput(started.jobId, info);
    const id = fileIdForUri(info.uri);
    expect(getJob(s.db, started.jobId)?.outputIds).toEqual([id]);
    // Indexed now, so the next process can resolve it even if this one dies.
    expect(getFile(s.db, id)).toMatchObject({ name: 'a part 1.pdf', source: 'output' });
  });

  /** A split the previous process was running when it died, with one part already published. */
  function deadSplit(db: IndexDb): string[] {
    createJob(db, {
      id: 'dead',
      toolId: 'split',
      inputIds: ['a'],
      options: { split: { mode: 'everyN', n: 1 } },
      now: 1,
    });
    addJobOutput(db, 'dead', 'p1');
    addJobOutput(db, 'dead', 'gone');
    return failInterruptedJobs(db, 5);
  }

  it('seeds last with the interrupted job, unseen, with its saved parts', () => {
    const s = setup();
    const [id] = deadSplit(s.db);
    mockFiles.getRows.mockImplementation((ids: string[]) =>
      ids.filter((x) => x !== 'gone').map((x) => makeRow({ name: x, id: x })),
    );
    s.store.getState().recoverInterrupted(id!);
    expect(s.store.getState().last).toMatchObject({
      jobId: 'dead',
      toolId: 'split',
      inputIds: ['a'],
      seen: false,
      outcome: { ok: false, failure: 'interrupted', inputIndex: null },
    });
    const view = s.store.getState().outcomeOf('dead');
    expect(view).toMatchObject({
      kind: 'done',
      toolId: 'split',
      outcome: { ok: false, failure: 'interrupted', inputIndex: null },
    });
    // Unresolvable ids are skipped.
    expect(view.kind === 'done' && view.outcome.outputs.map((r) => r.id)).toEqual(['p1']);
    s.store.getState().markSeen('dead');
    expect(s.store.getState().last?.seen).toBe(true);
    mockFiles.getRows.mockImplementation((ids: string[]) =>
      ids.map((x) => makeRow({ name: x, id: x })),
    );
  });

  it('resolves the saved parts again once the index knows them', () => {
    const s = setup();
    const [id] = deadSplit(s.db);
    mockFiles.getRows.mockImplementation(() => []);
    s.store.getState().recoverInterrupted(id!);
    mockFiles.getRows.mockImplementation((ids: string[]) =>
      ids.map((x) => makeRow({ name: x, id: x })),
    );
    const view = s.store.getState().outcomeOf('dead');
    expect(view.kind === 'done' && view.outcome.outputs.map((r) => r.id)).toEqual(['p1', 'gone']);
  });

  it('never replaces a job of this process, nor seeds unknown or non-tool rows', async () => {
    const s = setup();
    const [id] = deadSplit(s.db);
    s.store.getState().recoverInterrupted('nope');
    expect(s.store.getState().last).toBeNull();
    createJob(s.db, { id: 'cmp', toolId: 'compress', inputIds: ['a'], options: {}, now: 1 });
    s.store.getState().recoverInterrupted('cmp');
    expect(s.store.getState().last).toBeNull();

    const started = s.store.getState().start(merge, t);
    if (!started.ok) throw new Error('expected ok');
    s.store.getState().recoverInterrupted(id!);
    expect(s.store.getState().last).toBeNull();
    s.calls[0]!.resolve({ ok: true, outputs: [] });
    await flush();
    s.store.getState().recoverInterrupted(id!);
    expect(s.store.getState().last?.jobId).toBe(started.jobId);
  });

  it('ignores a failing database', () => {
    const s = setup();
    const store = createToolJobStore({
      getDb: () => {
        throw new Error('closed');
      },
      run: s.run,
      runDeps: () => ({}) as ToolRunDeps,
      now: () => 1,
      random: () => 0.5,
      cleanSession: jest.fn(),
    });
    expect(() => store.getState().recoverInterrupted('dead')).not.toThrow();
    expect(store.getState().last).toBeNull();
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

describe('toolJobStore images and scans', () => {
  it('optionsOf stores the session, images, filter and layout, never the name', () => {
    const options = optionsOf(imagesReq);
    expect(options).toEqual({
      sessionId: 'img-s1',
      images: [2, 0, 1],
      filter: 'greyscale',
      layout: { pageSize: 'a4', orientation: 'auto', margin: 'small' },
      quality: 'standard',
    });
    expect(options).not.toHaveProperty('name');
  });

  it('requestFromJob rebuilds an image request without its name', () => {
    const db = makeDb();
    for (const toolId of ['images-to-pdf', 'scan'] as const) {
      const req: ImagesRequest = { ...imagesReq, toolId };
      createJob(db, { id: toolId, toolId, inputIds: [], options: optionsOf(req), now: 1 });
      expect(requestFromJob(getJob(db, toolId)!)).toEqual({ ...req, name: null });
    }
  });

  it('stores the quality and rebuilds it, defaulting a missing or invalid one to standard', () => {
    expect(optionsOf({ ...imagesReq, quality: 'compact' }).quality).toBe('compact');
    const db = makeDb();
    const { quality: _q, ...old } = optionsOf(imagesReq);
    createJob(db, { id: 'old', toolId: 'images-to-pdf', inputIds: [], options: old, now: 1 });
    expect(requestFromJob(getJob(db, 'old')!)).toMatchObject({ quality: 'standard' });
    createJob(db, {
      id: 'bad',
      toolId: 'scan',
      inputIds: [],
      options: { ...old, quality: 'x' },
      now: 1,
    });
    expect(requestFromJob(getJob(db, 'bad')!)).toMatchObject({ quality: 'standard' });
    createJob(db, {
      id: 'c',
      toolId: 'scan',
      inputIds: [],
      options: { ...old, quality: 'compact' },
      now: 1,
    });
    expect(requestFromJob(getJob(db, 'c')!)).toMatchObject({ quality: 'compact' });
  });

  it('requestFromJob refuses malformed image rows', () => {
    const db = makeDb();
    const base = optionsOf(imagesReq);
    const bad: Record<string, unknown>[] = [
      { ...base, sessionId: '../x' },
      { ...base, sessionId: 'job-1' },
      { ...base, filter: 'sepia' },
      { ...base, images: [] },
      { ...base, images: [0, -1] },
      { ...base, images: [0.5] },
      { ...base, images: 'all' },
      { ...base, layout: { pageSize: 'a3', orientation: 'auto', margin: 'small' } },
      {},
    ];
    bad.forEach((options, i) => {
      createJob(db, { id: `b${i}`, toolId: 'images-to-pdf', inputIds: [], options, now: 1 });
      expect(requestFromJob(getJob(db, `b${i}`)!)).toBeNull();
    });
  });

  it('deletes the image session after a successful job only', async () => {
    const s = setup();
    s.store.getState().start(imagesReq, t);
    s.calls[0]!.resolve({ ok: false, failure: 'io', inputIndex: null, outputs: [] });
    await flush();
    expect(s.cleanSession).not.toHaveBeenCalled();

    s.store.getState().start(imagesReq, t);
    s.calls[1]!.resolve({ ok: true, outputs: [makeRow({ name: 'Receipt.pdf' })] });
    await flush();
    expect(s.cleanSession.mock.calls).toEqual([['img-s1']]);

    s.store.getState().start(merge, t);
    s.calls[2]!.resolve({ ok: true, outputs: [] });
    await flush();
    expect(s.cleanSession).toHaveBeenCalledTimes(1);
  });

  it('ignores a failing session cleanup', async () => {
    const s = setup();
    s.cleanSession.mockRejectedValueOnce(new Error('io'));
    const started = s.store.getState().start(imagesReq, t);
    s.calls[0]!.resolve({ ok: true, outputs: [] });
    await flush();
    if (!started.ok) throw new Error('expected ok');
    expect(getJob(s.db, started.jobId)?.status).toBe('succeeded');
    expect(s.store.getState().last?.outcome.ok).toBe(true);
  });

  it('retry of the last image job reuses its request, name included', async () => {
    const s = setup();
    const first = s.store.getState().start(imagesReq, t);
    if (!first.ok) throw new Error('expected ok');
    expect(getJob(s.db, first.jobId)?.inputIds).toEqual([]);
    s.calls[0]!.resolve({ ok: false, failure: 'io', inputIndex: null, outputs: [] });
    await flush();
    expect(s.store.getState().last?.request).toEqual(imagesReq);
    const again = s.store.getState().retry(first.jobId, t);
    expect(again.ok).toBe(true);
    expect(s.calls[1]!.request).toEqual(imagesReq);
  });

  it('retry of an image job from another process is gone, without running', async () => {
    const s = setup();
    const first = s.store.getState().start(imagesReq, t);
    if (!first.ok) throw new Error('expected ok');
    s.calls[0]!.resolve({ ok: false, failure: 'io', inputIndex: null, outputs: [] });
    await flush();
    const next = setup(s.db);
    expect(next.store.getState().retry(first.jobId, t)).toEqual({ ok: false, reason: 'gone' });
    expect(next.run).not.toHaveBeenCalled();
  });

  it('reads image jobs from the DB and never names an input', async () => {
    const s = setup();
    const started = s.store.getState().start({ ...imagesReq, toolId: 'scan' }, t);
    if (!started.ok) throw new Error('expected ok');
    s.calls[0]!.resolve({ ok: false, failure: 'imageInvalid', inputIndex: 1, outputs: [] });
    await flush();
    expect(s.store.getState().inputNameOf(started.jobId, 1)).toBeNull();
    expect(s.store.getState().inputNameOf(started.jobId, 0)).toBeNull();
    const fresh = setup(s.db);
    expect(fresh.store.getState().outcomeOf(started.jobId)).toEqual({
      kind: 'done',
      toolId: 'scan',
      outcome: { ok: false, failure: 'imageInvalid', inputIndex: null, outputs: [] },
    });
  });

  it('deletes a kept image session once another job finishes after it', async () => {
    const s = setup();
    s.store.getState().start(imagesReq, t);
    s.calls[0]!.resolve({ ok: false, failure: 'io', inputIndex: null, outputs: [] });
    await flush();
    expect(s.cleanSession).not.toHaveBeenCalled();

    // A later job of another tool replaces it as `last`: no retry can reach that session now.
    s.store.getState().start(merge, t);
    s.calls[1]!.resolve({ ok: false, failure: 'io', inputIndex: null, outputs: [] });
    await flush();
    expect(s.cleanSession.mock.calls).toEqual([['img-s1']]);

    s.store.getState().start(merge, t);
    s.calls[2]!.resolve({ ok: true, outputs: [] });
    await flush();
    expect(s.cleanSession).toHaveBeenCalledTimes(1);
  });

  it('keeps the session while a retry of the same session fails again', async () => {
    const s = setup();
    const first = s.store.getState().start(imagesReq, t);
    if (!first.ok) throw new Error('expected ok');
    s.calls[0]!.resolve({ ok: false, failure: 'cancelled', inputIndex: null, outputs: [] });
    await flush();
    s.store.getState().retry(first.jobId, t);
    s.calls[1]!.resolve({ ok: false, failure: 'io', inputIndex: null, outputs: [] });
    await flush();
    expect(s.cleanSession).not.toHaveBeenCalled();
    // A new session's job replacing it cleans the old one.
    s.store.getState().start({ ...imagesReq, sessionId: 'img-s2' }, t);
    s.calls[2]!.resolve({ ok: false, failure: 'io', inputIndex: null, outputs: [] });
    await flush();
    expect(s.cleanSession.mock.calls).toEqual([['img-s1']]);
  });

  it('dismissing a failed image job deletes its session; retry then reports gone', async () => {
    const s = setup();
    const first = s.store.getState().start(imagesReq, t);
    if (!first.ok) throw new Error('expected ok');
    s.calls[0]!.resolve({ ok: false, failure: 'io', inputIndex: null, outputs: [] });
    await flush();
    s.store.getState().dismiss('other');
    expect(s.cleanSession).not.toHaveBeenCalled();
    s.store.getState().dismiss(first.jobId);
    expect(s.cleanSession.mock.calls).toEqual([['img-s1']]);
    expect(s.store.getState().retry(first.jobId, t)).toEqual({ ok: false, reason: 'gone' });
    expect(s.run).toHaveBeenCalledTimes(1);
    // Cleaned once: neither a second dismiss nor the next job cleans it again.
    s.store.getState().dismiss(first.jobId);
    s.store.getState().start(merge, t);
    s.calls[1]!.resolve({ ok: true, outputs: [] });
    await flush();
    expect(s.cleanSession).toHaveBeenCalledTimes(1);
  });

  it('dismiss leaves successful, running and non-image jobs alone', async () => {
    const s = setup();
    const ok = s.store.getState().start(imagesReq, t);
    if (!ok.ok) throw new Error('expected ok');
    s.calls[0]!.resolve({ ok: true, outputs: [] });
    await flush();
    s.cleanSession.mockClear();
    s.store.getState().dismiss(ok.jobId);
    const merged = s.store.getState().start(merge, t);
    if (!merged.ok) throw new Error('expected ok');
    s.calls[1]!.resolve({ ok: false, failure: 'io', inputIndex: null, outputs: [] });
    await flush();
    s.store.getState().dismiss(merged.jobId);
    // A failed image job whose retry is running keeps its session.
    const failed = s.store.getState().start(imagesReq, t);
    if (!failed.ok) throw new Error('expected ok');
    s.calls[2]!.resolve({ ok: false, failure: 'io', inputIndex: null, outputs: [] });
    await flush();
    s.store.getState().retry(failed.jobId, t);
    s.store.getState().dismiss(failed.jobId);
    expect(s.cleanSession).not.toHaveBeenCalled();
  });
});
