/** @jest-environment node */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { FileRow } from '@/db/schema';
import { initI18n } from '@/i18n';
import type { PdfFileInfo } from '@/services/native/pdfNative';
import { makeRow } from '@/test-utils/fileRows';
import { nativeError } from '@/test-utils/fakePdfNative';
import { makeTempDir, nodeToolFs, tempPathOf } from '@/test-utils/nodeToolFs';
import { loadStrict, readFixture } from '@/test-utils/pdfFixtures';

import { runTool, type ToolPhase, type ToolRequest, type ToolRunDeps } from '../runTool';

const i18n = initI18n('en');
const t = (key: string, options?: Record<string, unknown>): string => i18n.t(key, options);
const FIXTURES = path.join(__dirname, '..', '..', '..', '..', '__fixtures__');

const sha = (name: string) =>
  createHash('sha256')
    .update(fs.readFileSync(path.join(FIXTURES, name.normalize('NFC'))))
    .digest('hex');

function setup(rows: FileRow[]) {
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
    cleanToolWorkspace: jest.fn(async (jobId: string) => {
      fs.rmSync(path.join(tmp, jobId), { recursive: true, force: true });
    }),
  };
  const registerOutputs = jest.fn(async (infos: PdfFileInfo[]) =>
    infos.map((info) => makeRow({ name: info.name, uri: info.uri, source: 'output' })),
  );
  const deps: ToolRunDeps = {
    native,
    fs: nodeToolFs,
    getRows: (ids) => rows.filter((r) => ids.includes(r.id)),
    registerOutputs,
    t,
    now: Date.now,
  };
  const phases: ToolPhase[] = [];
  const controller = new AbortController();
  const control = {
    signal: controller.signal,
    onProgress: (phase: ToolPhase) => {
      if (phases[phases.length - 1] !== phase) phases.push(phase);
    },
  };
  const run = (request: ToolRequest, jobId = 'j1') => runTool(jobId, request, deps, control);
  return { tmp, native, registerOutputs, published, phases, controller, run };
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
  });
});
