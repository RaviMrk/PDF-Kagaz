/** @jest-environment node */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { FileRow } from '@/db/schema';
import { initI18n } from '@/i18n';
import type { ImageFilter, PdfFileInfo, PreparedPage } from '@/services/native/pdfNative';
import type { ImageLayoutOptions } from '@/services/pdf/imageLayout';
import * as imagesToPdfModule from '@/services/pdf/imagesToPdf';
import * as loadPdfModule from '@/services/pdf/loadPdf';
import { fileIdForUri } from '@/utils/fileId';
import { makeRow } from '@/test-utils/fileRows';
import { nativeError } from '@/test-utils/fakePdfNative';
import { makeTempDir, nodeToolFs, tempPathOf } from '@/test-utils/nodeToolFs';
import { inspectPages, loadStrict, readFixture } from '@/test-utils/pdfFixtures';

import {
  runTool,
  type ImagesRequest,
  type ToolPhase,
  type ToolRequest,
  type ToolRunDeps,
} from '../runTool';

const i18n = initI18n('en');
const t = (key: string, options?: Record<string, unknown>): string => i18n.t(key, options);
const FIXTURES = path.join(__dirname, '..', '..', '..', '..', '__fixtures__');

const sha = (name: string) =>
  createHash('sha256')
    .update(fs.readFileSync(path.join(FIXTURES, name.normalize('NFC'))))
    .digest('hex');

/** `sources[i]` is the fixture under `images/` that image session source `i` holds. */
function setup(rows: FileRow[], sources: string[] = []) {
  const tmp = makeTempDir();
  const docs = path.join(tmp, 'Documents', 'PDFToolkit');
  fs.mkdirSync(docs, { recursive: true });
  const published: { name: string; path: string }[] = [];
  const native = {
    createToolWorkspace: jest.fn(async (jobId: string) => {
      const dir = path.join(tmp, jobId);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir);
      return `file://${dir}`;
    }),
    stageToolInput: jest.fn(async (uri: string, jobId: string, i: number, maxBytes: number) => {
      const name = decodeURIComponent(uri.slice(uri.lastIndexOf('/') + 1));
      const bytes = fs.readFileSync(path.join(FIXTURES, name.normalize('NFC')));
      if (bytes.length > maxBytes) throw nativeError('ERR_TOO_LARGE');
      const dest = path.join(tmp, jobId, `in-${i}.pdf`);
      fs.writeFileSync(dest, bytes);
      return { uri: `file://${dest}`, sizeBytes: bytes.length };
    }),
    publishToolOutput: jest.fn(async (tempUri: string, fileName: string): Promise<PdfFileInfo> => {
      let name = fileName;
      for (let n = 1; fs.existsSync(path.join(docs, name)); n++) {
        name = fileName.replace(/\.pdf$/, ` (${n}).pdf`);
      }
      const dest = path.join(docs, name);
      fs.copyFileSync(tempPathOf(tempUri), dest);
      published.push({ name, path: dest });
      return {
        uri: `file://${dest}`,
        name,
        folder: 'Documents/PDFToolkit',
        parentUri: `file://${docs}`,
        parentModifiedAt: 0,
        sizeBytes: fs.statSync(dest).size,
        modifiedAt: 0,
      };
    }),
    prepareImagePage: jest.fn(
      async (
        _sessionId: string,
        sourceIndex: number,
        jobId: string,
        pageIndex: number,
        _maxLongSidePx: number,
        _jpegQuality: number,
        _filter: ImageFilter,
      ): Promise<PreparedPage> => {
        const name = sources[sourceIndex];
        if (name === undefined) throw nativeError('ERR_FILE_NOT_FOUND');
        const bytes = fs.readFileSync(path.join(FIXTURES, 'images', name));
        const dest = path.join(tmp, jobId, `page-${pageIndex}.jpg`);
        fs.writeFileSync(dest, bytes);
        return { uri: `file://${dest}`, width: 1, height: 1, sizeBytes: bytes.length };
      },
    ),
    cleanToolWorkspace: jest.fn(async (jobId: string) => {
      fs.rmSync(path.join(tmp, jobId), { recursive: true, force: true });
    }),
  };
  const registerOutputs = jest.fn(async (infos: PdfFileInfo[]) =>
    infos.map((info) => makeRow({ name: info.name, uri: info.uri, source: 'output' })),
  );
  const toolFs = {
    readBytes: jest.fn(nodeToolFs.readBytes),
    writeBytes: jest.fn(nodeToolFs.writeBytes),
  };
  const recordOutput = jest.fn<void, [string, PdfFileInfo]>();
  const clock = { now: Date.now() };
  const deps: ToolRunDeps = {
    native,
    fs: toolFs,
    getRows: (ids) => rows.filter((r) => ids.includes(r.id)),
    registerOutputs,
    recordOutput,
    t,
    now: () => clock.now,
  };
  const phases: ToolPhase[] = [];
  const events: [ToolPhase, number][] = [];
  const controller = new AbortController();
  const control = {
    signal: controller.signal,
    onProgress: (phase: ToolPhase, fraction: number) => {
      events.push([phase, fraction]);
      if (phases[phases.length - 1] !== phase) phases.push(phase);
    },
  };
  const run = (request: ToolRequest, jobId = 'j1') => runTool(jobId, request, deps, control);
  return {
    tmp,
    native,
    toolFs,
    registerOutputs,
    recordOutput,
    published,
    phases,
    events,
    controller,
    clock,
    run,
  };
}

const row = (name: string, over: Partial<FileRow> = {}) =>
  makeRow({ name, sizeBytes: 2048, ...over });

let logSpy: jest.SpyInstance;
beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => logSpy.mockRestore());

describe('runTool merge', () => {
  it('stages, merges, publishes once, registers and cleans the workspace', async () => {
    const names = ['one-page.pdf', 'mixed-sizes.pdf', 'अहवाल.pdf'];
    const before = names.map(sha);
    const rows = names.map((n) => row(n));
    const s = setup(rows);
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    expect(outcome.ok).toBe(true);
    expect(s.native.publishToolOutput).toHaveBeenCalledTimes(1);
    expect(s.native.publishToolOutput).toHaveBeenCalledWith(
      `file://${s.tmp}/j1/out-1.pdf`,
      'one-page merged.pdf',
    );
    const doc = await loadStrict(new Uint8Array(fs.readFileSync(s.published[0]!.path)));
    expect(doc.getPageCount()).toBe(6);
    expect(s.registerOutputs).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'one-page merged.pdf' }),
    ]);
    expect(outcome.outputs).toHaveLength(1);
    expect(s.native.cleanToolWorkspace).toHaveBeenCalledWith('j1');
    expect(fs.existsSync(path.join(s.tmp, 'j1'))).toBe(false);
    expect(names.map(sha)).toEqual(before);
    expect(s.phases).toEqual(['preparing', 'processing', 'saving']);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[tool\] merge \d+ms 6 pages 1 files$/),
    );
  });

  it('refuses a protected input with its index, publishing nothing', async () => {
    const rows = [row('one-page.pdf'), row('protected.pdf')];
    const s = setup(rows);
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    expect(outcome).toEqual({ ok: false, failure: 'encrypted', inputIndex: 1, outputs: [] });
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
    expect(s.native.cleanToolWorkspace).toHaveBeenCalledWith('j1');
    expect(fs.existsSync(path.join(s.tmp, 'j1'))).toBe(false);
  });

  it('reports a corrupted input as invalid', async () => {
    const rows = [row('corrupted.pdf'), row('one-page.pdf')];
    const s = setup(rows);
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    expect(outcome).toMatchObject({ ok: false, failure: 'invalid', inputIndex: 0 });
  });
});

describe('runTool size and staging failures', () => {
  it('refuses a row over the per-file cap before staging', async () => {
    const rows = [row('one-page.pdf'), row('mixed-sizes.pdf', { sizeBytes: 31_457_281 })];
    const s = setup(rows);
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    expect(outcome).toEqual({ ok: false, failure: 'tooLarge', inputIndex: 1, outputs: [] });
    expect(s.native.stageToolInput).not.toHaveBeenCalled();
  });

  it('refuses a combined size over the total cap', async () => {
    const rows = ['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf'].map((n) => row(n, { sizeBytes: 30_000_000 }));
    const s = setup(rows);
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    expect(outcome).toMatchObject({ ok: false, failure: 'totalTooLarge', inputIndex: null });
    expect(s.native.stageToolInput).not.toHaveBeenCalled();
  });

  it('maps the native stage cap to tooLarge when the provider size is unknown', async () => {
    const rows = [row('one-page.pdf', { sizeBytes: 0 }), row('mixed-sizes.pdf', { sizeBytes: 0 })];
    const s = setup(rows);
    s.native.stageToolInput.mockRejectedValueOnce(nativeError('ERR_TOO_LARGE'));
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    expect(outcome).toEqual({ ok: false, failure: 'tooLarge', inputIndex: 0, outputs: [] });
    expect(s.native.cleanToolWorkspace).toHaveBeenCalledWith('j1');
  });

  it('never treats an invalid stored size as small', async () => {
    const rows = [
      row('one-page.pdf', { sizeBytes: Number.NaN }),
      row('mixed-sizes.pdf', { sizeBytes: -5 }),
    ];
    const s = setup(rows);
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    // Unknown sizes defer to the native stage cap, which is always passed.
    expect(outcome.ok).toBe(true);
    for (const call of s.native.stageToolInput.mock.calls) expect(call[3]).toBe(31_457_280);
  });

  it('maps a missing input at staging to notFound with its index', async () => {
    const rows = [row('one-page.pdf'), row('mixed-sizes.pdf'), row('अहवाल.pdf')];
    const s = setup(rows);
    s.native.stageToolInput.mockImplementation(async (_u, _j, i) => {
      if (i === 2) throw nativeError('ERR_FILE_NOT_FOUND');
      return { uri: 'file:///nope', sizeBytes: 1 };
    });
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    expect(outcome).toEqual({ ok: false, failure: 'notFound', inputIndex: 2, outputs: [] });
  });

  it('maps a refused read grant to permission', async () => {
    const rows = [row('one-page.pdf'), row('mixed-sizes.pdf')];
    const s = setup(rows);
    s.native.stageToolInput.mockRejectedValueOnce(nativeError('ERR_PERMISSION_DENIED'));
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    expect(outcome).toMatchObject({ ok: false, failure: 'permission', inputIndex: 0 });
  });

  it('reports a missing row as notFound without native calls', async () => {
    const rows = [row('one-page.pdf')];
    const s = setup(rows);
    const outcome = await s.run({ toolId: 'merge', inputIds: [rows[0]!.id, 'gone'] });
    expect(outcome).toEqual({ ok: false, failure: 'notFound', inputIndex: 1, outputs: [] });
    expect(s.native.createToolWorkspace).not.toHaveBeenCalled();
    expect(s.native.cleanToolWorkspace).not.toHaveBeenCalled();
  });
});

describe('runTool split and organize', () => {
  const big = () => row('two-hundred-pages.pdf');

  it('splits ranges into named parts', async () => {
    const r = big();
    const s = setup([r]);
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'ranges', ranges: '1-3, 5' },
    });
    expect(outcome.ok).toBe(true);
    expect(s.native.publishToolOutput.mock.calls.map((c) => c[1])).toEqual([
      'two-hundred-pages pages 1-3.pdf',
      'two-hundred-pages page 5.pdf',
    ]);
    expect(s.native.publishToolOutput.mock.calls.map((c) => c[0])).toEqual([
      `file://${s.tmp}/j1/out-1.pdf`,
      `file://${s.tmp}/j1/out-2.pdf`,
    ]);
    expect(outcome.outputs).toHaveLength(2);
  });

  it('publishes duplicate ranges under the same requested name', async () => {
    const r = big();
    const s = setup([r]);
    await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'ranges', ranges: '1-3, 1-3' },
    });
    expect(s.native.publishToolOutput.mock.calls.map((c) => c[1])).toEqual([
      'two-hundred-pages pages 1-3.pdf',
      'two-hundred-pages pages 1-3.pdf',
    ]);
  });

  it('splits every N pages', async () => {
    const r = big();
    const s = setup([r]);
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'everyN', n: 50 },
    });
    expect(outcome.ok && outcome.outputs.length).toBe(4);
  });

  it('extracts the union of ranges into one file', async () => {
    const r = big();
    const s = setup([r]);
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'extract', ranges: '5, 1-2' },
    });
    expect(outcome.ok).toBe(true);
    expect(s.published).toHaveLength(1);
    const doc = await loadStrict(new Uint8Array(fs.readFileSync(s.published[0]!.path)));
    expect(doc.getPageCount()).toBe(3);
  });

  it('maps a bad range to badPages without publishing', async () => {
    const r = big();
    const s = setup([r]);
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'ranges', ranges: '0-3' },
    });
    expect(outcome).toMatchObject({ ok: false, failure: 'badPages' });
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
    expect(s.native.cleanToolWorkspace).toHaveBeenCalledWith('j1');
  });

  it('organizes pages into one output', async () => {
    const r = row('mixed-sizes.pdf');
    const s = setup([r]);
    const outcome = await s.run({
      toolId: 'organize',
      inputIds: [r.id],
      pages: [{ source: 2, rotate: 90 }],
    });
    expect(outcome.ok).toBe(true);
    expect(s.native.publishToolOutput.mock.calls.map((c) => c[1])).toEqual([
      'mixed-sizes organised.pdf',
    ]);
    const doc = await loadStrict(new Uint8Array(fs.readFileSync(s.published[0]!.path)));
    expect(doc.getPageCount()).toBe(1);
  });
});

describe('runTool cancel and partial publish', () => {
  it('cancels before processing: nothing published, workspace cleaned', async () => {
    const rows = [row('one-page.pdf'), row('mixed-sizes.pdf')];
    const s = setup(rows);
    s.native.stageToolInput.mockImplementation(async (_u, jobId, i) => {
      if (i === 1) s.controller.abort();
      const dest = path.join(s.tmp, jobId, `in-${i}.pdf`);
      fs.writeFileSync(dest, readFixture('one-page.pdf'));
      return { uri: `file://${dest}`, sizeBytes: 941 };
    });
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    expect(outcome).toEqual({ ok: false, failure: 'cancelled', inputIndex: null, outputs: [] });
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(s.tmp, 'j1'))).toBe(false);
  });

  it('keeps the parts already published when a later publish fails', async () => {
    const r = row('two-hundred-pages.pdf');
    const s = setup([r]);
    const real = s.native.publishToolOutput.getMockImplementation()!;
    s.native.publishToolOutput
      .mockImplementationOnce(real)
      .mockRejectedValueOnce(nativeError('ERR_IO'));
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'ranges', ranges: '1, 2, 3' },
    });
    expect(outcome).toMatchObject({ ok: false, failure: 'io', inputIndex: null });
    expect(outcome.outputs).toHaveLength(1);
    expect(s.registerOutputs).toHaveBeenCalledTimes(1);
    expect(s.native.publishToolOutput).toHaveBeenCalledTimes(2);
    expect(fs.existsSync(path.join(s.tmp, 'j1'))).toBe(false);
    // Part 1 was recorded on the job as soon as it was published, before the failure.
    // Part 1 was recorded (and indexed) as soon as it was published, before the failure.
    expect(s.recordOutput.mock.calls).toEqual([
      ['j1', expect.objectContaining({ uri: `file://${s.published[0]!.path}` })],
    ]);
    expect(outcome.outputs[0]?.id).toBe(fileIdForUri(s.recordOutput.mock.calls[0]![1].uri));
  });

  it('records each output on the job right after its publish', async () => {
    const r = row('two-hundred-pages.pdf');
    const s = setup([r]);
    const order: string[] = [];
    const real = s.native.publishToolOutput.getMockImplementation()!;
    s.native.publishToolOutput.mockImplementation(async (u, n) => {
      order.push(`publish ${n}`);
      return real(u, n);
    });
    s.recordOutput.mockImplementation((_j, info) => order.push(`record ${info.name}`));
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'ranges', ranges: '1, 2' },
    });
    expect(outcome.ok).toBe(true);
    const [a, b] = s.published.map((p) => p.name);
    expect(order).toEqual([`publish ${a}`, `record ${a}`, `publish ${b}`, `record ${b}`]);
  });

  it('a failing record never fails the job', async () => {
    const r = row('two-hundred-pages.pdf');
    const s = setup([r]);
    s.recordOutput.mockImplementation(() => {
      throw new Error('db');
    });
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'ranges', ranges: '1, 2' },
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.outputs).toHaveLength(2);
  });
});

/** Phases never go back and fractions never decrease within a phase. */
function expectMonotonic(events: [ToolPhase, number][]) {
  const order: ToolPhase[] = ['preparing', 'processing', 'saving'];
  for (let i = 1; i < events.length; i++) {
    const [pp, pf] = events[i - 1]!;
    const [p, f] = events[i]!;
    expect(order.indexOf(p)).toBeGreaterThanOrEqual(order.indexOf(pp));
    if (p === pp) expect(f).toBeGreaterThanOrEqual(pf);
  }
}

describe('runTool progress', () => {
  it('split reports one monotonic phase sequence', async () => {
    const r = row('two-hundred-pages.pdf');
    const s = setup([r]);
    await s.run({ toolId: 'split', inputIds: [r.id], split: { mode: 'everyN', n: 1 } });
    expect(s.phases).toEqual(['preparing', 'processing', 'saving']);
    expectMonotonic(s.events);
    expect(s.events[s.events.length - 1]).toEqual(['saving', 1]);
  });

  it('organize reports one monotonic phase sequence', async () => {
    const r = row('mixed-sizes.pdf');
    const s = setup([r]);
    await s.run({ toolId: 'organize', inputIds: [r.id], pages: [{ source: 1, rotate: 0 }] });
    expect(s.phases).toEqual(['preparing', 'processing', 'saving']);
    expectMonotonic(s.events);
  });

  it('merge progress is monotonic', async () => {
    const rows = [row('one-page.pdf'), row('mixed-sizes.pdf')];
    const s = setup(rows);
    await s.run({ toolId: 'merge', inputIds: rows.map((x) => x.id) });
    expectMonotonic(s.events);
  });
});

describe('runTool release log', () => {
  const g = globalThis as { __DEV__?: boolean };
  let dev: boolean | undefined;
  beforeEach(() => {
    dev = g.__DEV__;
    g.__DEV__ = false;
  });
  afterEach(() => {
    g.__DEV__ = dev;
  });

  it('logs timing in release without re-parsing the merged output', async () => {
    const spy = jest.spyOn(loadPdfModule, 'loadPdf');
    const names = ['one-page.pdf', 'mixed-sizes.pdf', 'अहवाल.pdf'];
    const rows = names.map((n) => row(n));
    const s = setup(rows);
    await s.run({ toolId: 'merge', inputIds: rows.map((x) => x.id) });
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockRestore();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[tool\] merge \d+ms 6 pages 1 files$/),
    );
  });
});

describe('runTool registration failures', () => {
  it('keeps published outputs and reports io when registration rejects', async () => {
    const rows = [row('one-page.pdf'), row('mixed-sizes.pdf')];
    const s = setup(rows);
    s.registerOutputs.mockRejectedValueOnce(new Error('db'));
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((x) => x.id) });
    expect(outcome).toMatchObject({ ok: false, failure: 'io', inputIndex: null });
    expect(outcome.outputs).toHaveLength(1);
    const info = await s.native.publishToolOutput.mock.results[0]!.value;
    expect(outcome.outputs[0]).toMatchObject({
      id: fileIdForUri(info.uri),
      uri: info.uri,
      name: 'one-page merged.pdf',
      source: 'output',
    });
  });

  it('keeps unregistered outputs when registration indexes nothing', async () => {
    const rows = [row('one-page.pdf'), row('mixed-sizes.pdf')];
    const s = setup(rows);
    s.registerOutputs.mockResolvedValueOnce([]);
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((x) => x.id) });
    expect(outcome.ok).toBe(true);
    expect(outcome.outputs.map((o) => o.name)).toEqual(['one-page merged.pdf']);
  });

  it('keeps the original failure and the published parts when registration rejects', async () => {
    const r = row('two-hundred-pages.pdf');
    const s = setup([r]);
    const real = s.native.publishToolOutput.getMockImplementation()!;
    s.native.publishToolOutput
      .mockImplementationOnce(real)
      .mockRejectedValueOnce(nativeError('ERR_PERMISSION_DENIED'));
    s.registerOutputs.mockRejectedValueOnce(new Error('db'));
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'ranges', ranges: '1, 2' },
    });
    expect(outcome).toMatchObject({ ok: false, failure: 'permission', inputIndex: null });
    expect(outcome.outputs).toHaveLength(1);
  });
});

describe('runTool cancellation around publishing', () => {
  it('cancel after the write and before the publish publishes nothing', async () => {
    const rows = [row('one-page.pdf'), row('mixed-sizes.pdf')];
    const s = setup(rows);
    s.toolFs.writeBytes.mockImplementationOnce(async (uri, bytes) => {
      await nodeToolFs.writeBytes(uri, bytes);
      s.controller.abort();
    });
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((x) => x.id) });
    expect(outcome).toEqual({ ok: false, failure: 'cancelled', inputIndex: null, outputs: [] });
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
    expect(s.native.cleanToolWorkspace).toHaveBeenCalledWith('j1');
    expect(fs.existsSync(path.join(s.tmp, 'j1'))).toBe(false);
  });

  it('cancel mid-split keeps the part already published', async () => {
    const r = row('two-hundred-pages.pdf');
    const s = setup([r]);
    const real = s.native.publishToolOutput.getMockImplementation()!;
    s.native.publishToolOutput.mockImplementationOnce(async (u, n) => {
      const info = await real(u, n);
      s.controller.abort();
      return info;
    });
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'ranges', ranges: '1, 2, 3' },
    });
    expect(outcome).toMatchObject({ ok: false, failure: 'cancelled', inputIndex: null });
    expect(outcome.outputs).toHaveLength(1);
    expect(s.native.publishToolOutput).toHaveBeenCalledTimes(1);
    expect(s.registerOutputs).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(s.tmp, 'j1'))).toBe(false);
  });
});

describe('runTool images and scans', () => {
  const LANDSCAPE = 'landscape-400x300.jpg';
  const PORTRAIT = 'portrait-300x400.jpg';
  const layout: ImageLayoutOptions = { pageSize: 'a4', orientation: 'auto', margin: 'small' };
  const STAMP = new Date(2026, 9, 23, 14, 5).getTime();
  const MIB = 1024 * 1024;
  const images = (over: Partial<ImagesRequest> = {}): ImagesRequest => ({
    toolId: 'images-to-pdf',
    inputIds: [],
    sessionId: 'img-s1',
    images: [1, 0],
    filter: 'colour',
    layout,
    name: null,
    quality: 'standard',
    ...over,
  });
  const imageSetup = () => {
    const s = setup([], [LANDSCAPE, PORTRAIT]);
    s.clock.now = STAMP;
    return s;
  };

  it('prepares each image in order, builds one PDF and names it', async () => {
    const s = imageSetup();
    const outcome = await s.run(images());
    expect(outcome.ok).toBe(true);
    expect(s.native.prepareImagePage.mock.calls).toEqual([
      ['img-s1', 1, 'j1', 0, 2400, 85, 'colour'],
      ['img-s1', 0, 'j1', 1, 2400, 85, 'colour'],
    ]);
    expect(s.native.createToolWorkspace).toHaveBeenCalledWith('j1');
    expect(s.published).toHaveLength(1);
    expect(s.published[0]!.name).toBe('Images 2026-10-23 14.05.pdf');
    const pages = await inspectPages(new Uint8Array(fs.readFileSync(s.published[0]!.path)));
    expect(pages.map((p) => p.size)).toEqual([
      [595, 842],
      [842, 595],
    ]);
    // The job workspace is cleaned; the image session is never touched by the runner.
    expect(s.native.cleanToolWorkspace.mock.calls).toEqual([['j1']]);
    expect(s.phases).toEqual(['preparing', 'processing', 'saving']);
    expectMonotonic(s.events);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[tool\] images-to-pdf \d+ms 2 pages 1 files$/),
    );
  });

  it('uses the high preset first pass', async () => {
    const s = imageSetup();
    await s.run(images({ quality: 'high' }));
    expect(s.native.prepareImagePage.mock.calls[0]!.slice(4, 6)).toEqual([3200, 90]);
  });

  it('names a scan with the typed name, or the scan default when blank', async () => {
    const named = imageSetup();
    await named.run(images({ toolId: 'scan', name: 'Receipt' }));
    expect(named.published.map((p) => p.name)).toEqual(['Receipt.pdf']);
    const blank = imageSetup();
    await blank.run(images({ toolId: 'scan', name: '  ' }));
    expect(blank.published.map((p) => p.name)).toEqual(['Scan 2026-10-23 14.05.pdf']);
  });

  it('reports images that are gone as imagesGone, publishing nothing', async () => {
    const s = imageSetup();
    s.native.prepareImagePage.mockRejectedValueOnce(nativeError('ERR_FILE_NOT_FOUND'));
    const outcome = await s.run(images());
    expect(outcome).toEqual({ ok: false, failure: 'imagesGone', inputIndex: null, outputs: [] });
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
    expect(s.native.cleanToolWorkspace.mock.calls).toEqual([['j1']]);
  });

  it('reports an undecodable image with its page index', async () => {
    const s = imageSetup();
    const real = s.native.prepareImagePage.getMockImplementation()!;
    s.native.prepareImagePage
      .mockImplementationOnce(real)
      .mockRejectedValueOnce(nativeError('ERR_IMAGE_INVALID'));
    const outcome = await s.run(images());
    expect(outcome).toEqual({ ok: false, failure: 'imageInvalid', inputIndex: 1, outputs: [] });
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
  });

  it('reports a prepared JPEG pdf-lib cannot embed as imageInvalid with its page index', async () => {
    const s = setup([], [LANDSCAPE, 'not-an-image.jpg']);
    const outcome = await s.run(images({ images: [0, 1] }));
    expect(outcome).toEqual({ ok: false, failure: 'imageInvalid', inputIndex: 1, outputs: [] });
  });

  it('refuses prepared pages over the total cap before building the PDF', async () => {
    const spy = jest.spyOn(imagesToPdfModule, 'imagesToPdf');
    const s = imageSetup();
    const real = s.native.prepareImagePage.getMockImplementation()!;
    const sizes = [60 * MIB, 50 * MIB];
    s.native.prepareImagePage.mockImplementation(async (...args) => ({
      ...(await real(...args)),
      sizeBytes: sizes[args[3]]!,
    }));
    const outcome = await s.run(images());
    expect(outcome).toEqual({
      ok: false,
      failure: 'totalTooLarge',
      inputIndex: null,
      outputs: [],
    });
    expect(spy).not.toHaveBeenCalled();
    expect(s.toolFs.readBytes).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  /** 100 photo-like pages: `first` bytes each at 2400 px / q85, `smaller` at any other size. */
  const hundredPhotos = (first: number, smaller: number, firstPx = 2400, firstQ = 85) => {
    const s = imageSetup();
    const real = s.native.prepareImagePage.getMockImplementation()!;
    s.native.prepareImagePage.mockImplementation(async (...args) => ({
      ...(await real(...args)),
      sizeBytes: args[4] === firstPx && args[5] === firstQ ? first : smaller,
    }));
    return s;
  };
  const hundred = (toolId: ImagesRequest['toolId'] = 'images-to-pdf') =>
    images({ toolId, images: Array.from({ length: 100 }, () => 0) });

  it('re-prepares a page over its share of the cap smaller, so 100 large photos still fit', async () => {
    // 100 × 1.2 MiB = 120 MiB would exceed the 100 MiB cap at the first pass.
    const s = hundredPhotos(1.2 * MIB, 0.6 * MIB);
    const outcome = await s.run(hundred());
    expect(outcome.ok).toBe(true);
    const calls = s.native.prepareImagePage.mock.calls;
    const smaller = calls.filter((c) => c[4] !== 2400);
    expect(smaller.length).toBeGreaterThan(0);
    // Each re-prepare is the same page once more, right after its first pass, at 1600 px / q75.
    for (const [i, call] of calls.entries()) {
      if (call[4] === 2400) continue;
      expect(call).toEqual(['img-s1', 0, 'j1', calls[i - 1]![3], 1600, 75, 'colour']);
      expect(calls[i - 1]!.slice(4, 6)).toEqual([2400, 85]);
    }
    expect(calls.length).toBe(100 + smaller.length);
    // Pages are prepared in order, every page index 0..99.
    const indices = calls.map((c) => c[3]);
    expect(new Set(indices).size).toBe(100);
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
    const pages = await inspectPages(new Uint8Array(fs.readFileSync(s.published[0]!.path)));
    expect(pages).toHaveLength(100);
  });

  it('re-prepares a compact job at its own smaller preset and a high job at 1600 / q75', async () => {
    const compact = hundredPhotos(1.2 * MIB, 0.6 * MIB, 1600, 75);
    await compact.run({ ...hundred(), quality: 'compact' });
    const cc = compact.native.prepareImagePage.mock.calls;
    expect(cc[0]!.slice(4, 6)).toEqual([1600, 75]);
    expect(cc.some((c) => c[4] === 1200 && c[5] === 65)).toBe(true);
    const high = hundredPhotos(1.2 * MIB, 0.6 * MIB, 3200, 90);
    await high.run({ ...hundred(), quality: 'high' });
    const hc = high.native.prepareImagePage.mock.calls;
    expect(hc[0]!.slice(4, 6)).toEqual([3200, 90]);
    expect(hc.some((c) => c[4] === 1600 && c[5] === 75)).toBe(true);
  });

  it('keeps first-pass pages that fit their share of the cap', async () => {
    const s = hundredPhotos(0.9 * MIB, 0.5 * MIB);
    const outcome = await s.run(hundred());
    expect(outcome.ok).toBe(true);
    expect(s.native.prepareImagePage).toHaveBeenCalledTimes(100);
  });

  it('fails with totalTooLarge when even the smaller pages exceed the cap', async () => {
    const spy = jest.spyOn(imagesToPdfModule, 'imagesToPdf');
    const s = hundredPhotos(1.2 * MIB, 1.1 * MIB);
    const outcome = await s.run(hundred('scan'));
    expect(outcome).toEqual({ ok: false, failure: 'totalTooLarge', inputIndex: null, outputs: [] });
    expect(spy).not.toHaveBeenCalled();
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('refuses no images, or more than 100, as badPages without native calls', async () => {
    const s = imageSetup();
    expect(await s.run(images({ images: [] }))).toEqual({
      ok: false,
      failure: 'badPages',
      inputIndex: null,
      outputs: [],
    });
    expect(await s.run(images({ images: Array.from({ length: 101 }, () => 0) }))).toMatchObject({
      ok: false,
      failure: 'badPages',
    });
    expect(s.native.createToolWorkspace).not.toHaveBeenCalled();
    expect(s.native.prepareImagePage).not.toHaveBeenCalled();
  });

  it('cancels after the first prepare: nothing more prepared or published', async () => {
    const s = imageSetup();
    const real = s.native.prepareImagePage.getMockImplementation()!;
    s.native.prepareImagePage.mockImplementationOnce(async (...args) => {
      const page = await real(...args);
      s.controller.abort();
      return page;
    });
    const outcome = await s.run(images());
    expect(outcome).toEqual({ ok: false, failure: 'cancelled', inputIndex: null, outputs: [] });
    expect(s.native.prepareImagePage).toHaveBeenCalledTimes(1);
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(s.tmp, 'j1'))).toBe(false);
  });

  it('a read failing because of a cancel reads as cancelled, never as a damaged image', async () => {
    const s = imageSetup();
    s.toolFs.readBytes.mockImplementationOnce(async () => {
      s.controller.abort();
      throw new Error('read interrupted');
    });
    const outcome = await s.run(images());
    expect(outcome).toEqual({ ok: false, failure: 'cancelled', inputIndex: null, outputs: [] });
  });
});
