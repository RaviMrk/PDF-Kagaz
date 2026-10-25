/** @jest-environment node */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { FileRow } from '@/db/schema';
import { initI18n } from '@/i18n';
import type {
  ImageFilter,
  PdfFileInfo,
  PdfLock,
  PreparedPage,
  RenderedPage,
  SavedImage,
  ToolProgressEvent,
} from '@/services/native/pdfNative';
import type { ImageLayoutOptions } from '@/services/pdf/imageLayout';
import * as imagesToPdfModule from '@/services/pdf/imagesToPdf';
import * as loadPdfModule from '@/services/pdf/loadPdf';
import { fileIdForUri } from '@/utils/fileId';
import { makeRow } from '@/test-utils/fileRows';
import { nativeError } from '@/test-utils/fakePdfNative';
import { makeTempDir, nodeToolFs, tempPathOf } from '@/test-utils/nodeToolFs';
import { inspectImages, inspectPages, loadStrict, readFixture } from '@/test-utils/pdfFixtures';
import * as stampModule from '@/services/pdf/stamp';

import {
  RUNNERS,
  runTool,
  type CompressLevel,
  type ImageFormat,
  type ImagesRequest,
  type SignaturePlacement,
  type ToolPhase,
  type ToolRequest,
  type ToolRunDeps,
  type WatermarkOptions,
} from '../runTool';
import { signatureSpec, watermarkSpec } from '../stampSpecs';

const i18n = initI18n('en');
const t = (key: string, options?: Record<string, unknown>): string => i18n.t(key, options);
const FIXTURES = path.join(__dirname, '..', '..', '..', '..', '__fixtures__');

const sha = (name: string) =>
  createHash('sha256')
    .update(fs.readFileSync(path.join(FIXTURES, name.normalize('NFC'))))
    .digest('hex');

const LOCKS: Record<string, PdfLock> = {
  'protected.pdf': 'password',
  'owner-only.pdf': 'restricted',
};

/** `sources[i]` is the fixture under `images/` that image session source `i` holds. */
function setup(rows: FileRow[], sources: string[] = []) {
  const tmp = makeTempDir();
  const docs = path.join(tmp, 'Documents', 'PDFToolkit');
  fs.mkdirSync(docs, { recursive: true });
  const published: { name: string; path: string }[] = [];
  const savedImages: { name: string; folder: string }[] = [];
  const stagedFrom = new Map<string, string>();
  const progressListeners = new Set<(e: ToolProgressEvent) => void>();
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
      stagedFrom.set(`file://${dest}`, name);
      return { uri: `file://${dest}`, sizeBytes: bytes.length };
    }),
    // protected.pdf needs "secret"; owner-only.pdf opens but needs "owner" for changes.
    inspectPdf: jest.fn(
      async (uri: string): Promise<PdfLock> => LOCKS[stagedFrom.get(uri) ?? ''] ?? 'none',
    ),
    unlockToolInput: jest.fn(
      async (fileUri: string, jobId: string, i: number, password: string | null) => {
        const lock = LOCKS[stagedFrom.get(fileUri) ?? ''] ?? 'none';
        if (lock === 'password' && password === null) throw nativeError('ERR_PDF_ENCRYPTED');
        if (lock === 'password' && password !== 'secret') throw nativeError('ERR_PASSWORD_WRONG');
        if (lock === 'restricted' && password !== 'owner') {
          throw nativeError(password === null ? 'ERR_PASSWORD_RESTRICTED' : 'ERR_PASSWORD_WRONG');
        }
        // The decrypted copy: a plain one-page PDF stands in for it.
        const bytes = fs.readFileSync(path.join(FIXTURES, 'one-page.pdf'));
        const dest = path.join(tmp, jobId, `in-${i}.open.pdf`);
        fs.writeFileSync(dest, bytes);
        return { uri: `file://${dest}`, sizeBytes: bytes.length };
      },
    ),
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
    getToolPageCount: jest.fn(async (fileUri: string) => {
      const bytes = new Uint8Array(fs.readFileSync(tempPathOf(fileUri)));
      return (await loadStrict(bytes)).getPageCount();
    }),
    releaseToolDocument: jest.fn(async () => {}),
    // Each output stands in as a plain one-page PDF, written where PdfBox would write it.
    assemblePdf: jest.fn(
      async (jobId: string, _inputUris: string[], outputsJson: string, firstOutput: number) => {
        const outputs = JSON.parse(outputsJson) as unknown[];
        const bytes = fs.readFileSync(path.join(FIXTURES, 'one-page.pdf'));
        return outputs.map((_, k) => {
          const dest = path.join(tmp, jobId, `out-native-${firstOutput + k}.pdf`);
          fs.writeFileSync(dest, bytes);
          return { uri: `file://${dest}`, sizeBytes: bytes.length };
        });
      },
    ),
    // The compressed copy: a 400-byte stand-in, written where PdfBox would write it.
    compressPdf: jest.fn(async (_fileUri: string, jobId: string, _level: CompressLevel) => {
      const dest = path.join(tmp, jobId, 'out-compressed.pdf');
      fs.writeFileSync(dest, new Uint8Array(400));
      return { uri: `file://${dest}`, sizeBytes: 400, imagesRecompressed: 2 };
    }),
    // The protected copy: a stand-in written where PdfBox would write it.
    protectPdf: jest.fn(async (_fileUri: string, jobId: string, _password: string) => {
      const dest = path.join(tmp, jobId, 'out-protected.pdf');
      fs.writeFileSync(dest, new Uint8Array(300));
      return { uri: `file://${dest}`, sizeBytes: 300 };
    }),
    // A page image: a stand-in written where PageExport would write it.
    renderPdfPage: jest.fn(
      async (
        _fileUri: string,
        jobId: string,
        page: number,
        _dpi: number,
        format: ImageFormat,
      ): Promise<RenderedPage> => {
        const dest = path.join(tmp, jobId, `img-${page}.${format}`);
        fs.writeFileSync(dest, new Uint8Array(10));
        return { uri: `file://${dest}`, page, width: 1240, height: 1754, reduced: false };
      },
    ),
    releasePageExport: jest.fn(async () => {}),
    // The stamped copy: a one-page stand-in written where PdfBox would write it.
    stampPdf: jest.fn(async (_fileUri: string, jobId: string, _specJson: string) => {
      const bytes = fs.readFileSync(path.join(FIXTURES, 'one-page.pdf'));
      const dest = path.join(tmp, jobId, 'out-stamped.pdf');
      fs.writeFileSync(dest, bytes);
      return { uri: `file://${dest}`, sizeBytes: bytes.length };
    }),
    // A rendered text watermark: a real transparent PNG where native would write it.
    renderTextStamp: jest.fn(
      async (jobId: string, _text: string, _color: number, _heightPx: number) => {
        const bytes = fs.readFileSync(path.join(FIXTURES, 'images', 'alpha-200x100.png'));
        const dest = path.join(tmp, jobId, 'stamp-text.png');
        fs.writeFileSync(dest, bytes);
        return { uri: `file://${dest}`, width: 200, height: 100, sizeBytes: bytes.length };
      },
    ),
    // Image session source `sourceIndex` prepared as a PNG (missing source: the session is gone).
    prepareStampImage: jest.fn(
      async (_sessionId: string, sourceIndex: number, jobId: string, _maxLongSidePx: number) => {
        if (sources[sourceIndex] === undefined) throw nativeError('ERR_FILE_NOT_FOUND');
        const bytes = fs.readFileSync(path.join(FIXTURES, 'images', 'alpha-200x100.png'));
        const dest = path.join(tmp, jobId, `stamp-image-${sourceIndex}.png`);
        fs.writeFileSync(dest, bytes);
        return { uri: `file://${dest}`, width: 200, height: 100, sizeBytes: bytes.length };
      },
    ),
    publishImageOutput: jest.fn(
      async (tempUri: string, fileName: string, folder: string): Promise<SavedImage> => {
        fs.rmSync(tempPathOf(tempUri));
        savedImages.push({ name: fileName, folder });
        return {
          uri: `content://media/external/images/media/${savedImages.length}`,
          name: fileName,
          folder: `Pictures/PDFToolkit/${folder}`,
        };
      },
    ),
    cancelNativeTool: jest.fn(async (_jobId: string) => {}),
    addToolProgressListener: jest.fn((cb: (e: ToolProgressEvent) => void) => {
      progressListeners.add(cb);
      return { remove: jest.fn(() => progressListeners.delete(cb)) };
    }),
  };
  const emitToolProgress = (e: ToolProgressEvent) => progressListeners.forEach((cb) => cb(e));
  const registerOutputs = jest.fn(async (infos: PdfFileInfo[]) =>
    infos.map((info) => makeRow({ name: info.name, uri: info.uri, source: 'output' })),
  );
  const toolFs = {
    readBytes: jest.fn(nodeToolFs.readBytes),
    writeBytes: jest.fn(nodeToolFs.writeBytes),
  };
  const recordOutput = jest.fn<void, [string, PdfFileInfo]>();
  // Saved signature 7: a real transparent PNG in the app's files dir (outside any workspace).
  const signatures = path.join(tmp, 'files', 'signatures');
  fs.mkdirSync(signatures, { recursive: true });
  const signaturePng = path.join(signatures, 'sig-1-abc123.png');
  fs.copyFileSync(path.join(FIXTURES, 'images', 'alpha-200x100.png'), signaturePng);
  const getSignaturePng = jest.fn((id: number): string | null =>
    id === 7 ? `file://${signaturePng}` : null,
  );
  const clock = { now: Date.now() };
  const deps: ToolRunDeps = {
    native,
    fs: toolFs,
    getRows: (ids) => rows.filter((r) => ids.includes(r.id)),
    registerOutputs,
    recordOutput,
    getSignaturePng,
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
    savedImages,
    phases,
    events,
    controller,
    clock,
    run,
    deps,
    progressListeners,
    emitToolProgress,
    signaturePng,
    getSignaturePng,
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
    const rows = [row('one-page.pdf'), row('mixed-sizes.pdf', { sizeBytes: 536_870_913 })];
    const s = setup(rows);
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    expect(outcome).toEqual({ ok: false, failure: 'tooLarge', inputIndex: 1, outputs: [] });
    expect(s.native.stageToolInput).not.toHaveBeenCalled();
  });

  it('refuses a combined size over the total cap', async () => {
    const rows = ['a.pdf', 'b.pdf', 'c.pdf'].map((n) => row(n, { sizeBytes: 400_000_000 }));
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
    for (const call of s.native.stageToolInput.mock.calls) expect(call[3]).toBe(536_870_912);
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

describe('runTool phase log', () => {
  it('times merge staging, reads, pdf-lib work, the write and the publish', async () => {
    const names = ['one-page.pdf', 'mixed-sizes.pdf'];
    const rows = names.map((n) => row(n));
    const s = setup(rows);
    const stage = s.native.stageToolInput.getMockImplementation()!;
    s.native.stageToolInput.mockImplementation(async (...args) => {
      s.clock.now += 11;
      return stage(...args);
    });
    s.toolFs.readBytes.mockImplementation(async (uri) => {
      s.clock.now += 2;
      return nodeToolFs.readBytes(uri);
    });
    await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    expect(logSpy).toHaveBeenLastCalledWith(
      '[tool-phases] merge stage=22ms prepare=0ms read=4ms embed=0ms save=0ms publish=0ms',
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
    // Page 0 is over its share: prepared at 2400 / q85, then once more at 1600 / q75. Every later
    // page goes straight to 1600 / q75, so each one is decoded once.
    expect(calls.slice(0, 2).map((c) => [c[3], c[4], c[5]])).toEqual([
      [0, 2400, 85],
      [0, 1600, 75],
    ]);
    expect(calls.slice(2).every((c) => c[4] === 1600 && c[5] === 75)).toBe(true);
    expect(calls).toHaveLength(101);
    expect(calls.slice(1).map((c) => c[3])).toEqual(Array.from({ length: 100 }, (_, i) => i));
    const pages = await inspectPages(new Uint8Array(fs.readFileSync(s.published[0]!.path)));
    expect(pages).toHaveLength(100);
  });

  /** Five pages; page 0 is `first0` bytes at its first pass, every other prepare is 1 MiB. */
  const fivePhotos = (first0: number) => {
    const s = imageSetup();
    const real = s.native.prepareImagePage.getMockImplementation()!;
    s.native.prepareImagePage.mockImplementation(async (...args) => ({
      ...(await real(...args)),
      sizeBytes: args[3] === 0 && args[4] === 2400 ? first0 : MIB,
    }));
    return s;
  };
  const five = () => images({ images: [0, 1, 0, 1, 0] });

  it('once a page was re-prepared smaller, prepares every later page smaller at once', async () => {
    // Page 0's share is 0.95 × 100 MiB / 5 ≈ 19 MiB.
    const s = fivePhotos(30 * MIB);
    expect((await s.run(five())).ok).toBe(true);
    expect(s.native.prepareImagePage.mock.calls.map((c) => [c[3], c[4], c[5]])).toEqual([
      [0, 2400, 85],
      [0, 1600, 75],
      [1, 1600, 75],
      [2, 1600, 75],
      [3, 1600, 75],
      [4, 1600, 75],
    ]);
  });

  it('keeps the preset for every page while no page runs over its share', async () => {
    const s = fivePhotos(MIB);
    expect((await s.run(five())).ok).toBe(true);
    expect(s.native.prepareImagePage.mock.calls.map((c) => [c[3], c[4], c[5]])).toEqual([
      [0, 2400, 85],
      [1, 2400, 85],
      [2, 2400, 85],
      [3, 2400, 85],
      [4, 2400, 85],
    ]);
    const lines = logSpy.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.startsWith('[tool-phases] images-to-pdf '))).toBe(true);
    expect(lines.join('\n')).not.toMatch(/\.pdf|\//);
  });

  it('re-prepares a compact job at its own smaller preset and a high job at 2400 / q85', async () => {
    const compact = hundredPhotos(1.2 * MIB, 0.6 * MIB, 1600, 75);
    await compact.run({ ...hundred(), quality: 'compact' });
    const cc = compact.native.prepareImagePage.mock.calls;
    expect(cc[0]!.slice(4, 6)).toEqual([1600, 75]);
    expect(cc.some((c) => c[4] === 1200 && c[5] === 65)).toBe(true);
    const high = hundredPhotos(1.2 * MIB, 0.6 * MIB, 3200, 90);
    await high.run({ ...hundred(), quality: 'high' });
    const hc = high.native.prepareImagePage.mock.calls;
    expect(hc[0]!.slice(4, 6)).toEqual([3200, 90]);
    expect(hc.some((c) => c[4] === 2400 && c[5] === 85)).toBe(true);
    expect(hc.some((c) => c[4] < 2400)).toBe(false);
  });

  it('never gives a high job a smaller long side than a standard job of the same photos', async () => {
    // 30 detailed photos: the share is ≈ 0.95 × 100 MiB / 30 ≈ 3.2 MiB. A 3200 / q90 page
    // (3.5 MiB) runs over it and the high job steps down; 2400 / q85 pages (1.5 MiB) fit.
    const bySize: Record<string, number> = {
      '3200/90': 3.5 * MIB,
      '2400/85': 1.5 * MIB,
      '1600/75': 0.7 * MIB,
    };
    const run = async (quality: ImagesRequest['quality']) => {
      const s = imageSetup();
      const real = s.native.prepareImagePage.getMockImplementation()!;
      s.native.prepareImagePage.mockImplementation(async (...args) => ({
        ...(await real(...args)),
        sizeBytes: bySize[`${args[4]}/${args[5]}`] ?? MIB,
      }));
      const outcome = await s.run(
        images({ quality, images: Array.from({ length: 30 }, (_, i) => i % 2) }),
      );
      expect(outcome.ok).toBe(true);
      // The last prepare of each page is the one kept (a re-prepare overwrites the page).
      const kept = new Map<number, number>();
      for (const c of s.native.prepareImagePage.mock.calls) kept.set(c[3], c[4]);
      return [...kept.values()];
    };
    const standard = await run('standard');
    const high = await run('high');
    expect(standard.every((px) => px === 2400)).toBe(true);
    expect(Math.min(...high)).toBeGreaterThanOrEqual(Math.max(...standard));
  });

  /** 100 photos whose page size depends only on the long side / quality pair. */
  const sizedHundred = (bySize: Record<string, number>) => {
    const s = imageSetup();
    const real = s.native.prepareImagePage.getMockImplementation()!;
    s.native.prepareImagePage.mockImplementation(async (...args) => ({
      ...(await real(...args)),
      sizeBytes: bySize[`${args[4]}/${args[5]}`] ?? MIB,
    }));
    return s;
  };
  /** Long side of the kept (last) prepare of each page. */
  const keptSides = (s: ReturnType<typeof imageSetup>) => {
    const kept = new Map<number, number>();
    for (const c of s.native.prepareImagePage.mock.calls) kept.set(c[3], c[4]);
    return [...kept.values()];
  };

  it('steps a high job down through 2400 to 1600 when only 1600 fits, like a standard job', async () => {
    // Share ≈ 0.95 MiB a page: 3200 / q90 and 2400 / q85 run over, 1600 / q75 fits (70 MiB total).
    const bySize = { '3200/90': 3 * MIB, '2400/85': 1.5 * MIB, '1600/75': 0.7 * MIB };
    const standard = sizedHundred(bySize);
    expect((await standard.run({ ...hundred(), quality: 'standard' })).ok).toBe(true);
    const high = sizedHundred(bySize);
    expect((await high.run({ ...hundred(), quality: 'high' })).ok).toBe(true);
    const calls = high.native.prepareImagePage.mock.calls;
    expect(calls.slice(0, 3).map((c) => [c[3], c[4], c[5]])).toEqual([
      [0, 3200, 90],
      [0, 2400, 85],
      [0, 1600, 75],
    ]);
    // Sticky: every later page goes straight to 1600 / q75, decoded once.
    expect(calls.slice(3).every((c) => c[4] === 1600 && c[5] === 75)).toBe(true);
    expect(calls).toHaveLength(102);
    expect(keptSides(high)).toEqual(Array.from({ length: 100 }, () => 1600));
  });

  it('stops a high job at 2400 when 2400 fits', async () => {
    const high = sizedHundred({ '3200/90': 3 * MIB, '2400/85': 0.9 * MIB, '1600/75': 0.5 * MIB });
    expect((await high.run({ ...hundred(), quality: 'high' })).ok).toBe(true);
    expect(high.native.prepareImagePage.mock.calls.some((c) => c[4] === 1600)).toBe(false);
    expect(keptSides(high)).toEqual(Array.from({ length: 100 }, () => 2400));
  });

  it('fails a high job with totalTooLarge only when even 1600 px pages exceed the cap', async () => {
    const s = sizedHundred({ '3200/90': 3 * MIB, '2400/85': 1.5 * MIB, '1600/75': 1.1 * MIB });
    const outcome = await s.run({ ...hundred(), quality: 'high' });
    expect(outcome).toEqual({ ok: false, failure: 'totalTooLarge', inputIndex: null, outputs: [] });
    expect(s.native.prepareImagePage.mock.calls.some((c) => c[4] === 1600)).toBe(true);
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
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

  it('logs per-phase timings after the [tool] line, with counts and milliseconds only', async () => {
    const s = imageSetup();
    const prepare = s.native.prepareImagePage.getMockImplementation()!;
    s.native.prepareImagePage.mockImplementation(async (...args) => {
      s.clock.now += 30;
      return prepare(...args);
    });
    s.toolFs.readBytes.mockImplementation(async (uri) => {
      s.clock.now += 4;
      return nodeToolFs.readBytes(uri);
    });
    s.toolFs.writeBytes.mockImplementation(async (uri, bytes) => {
      s.clock.now += 6;
      return nodeToolFs.writeBytes(uri, bytes);
    });
    const publish = s.native.publishToolOutput.getMockImplementation()!;
    s.native.publishToolOutput.mockImplementation(async (...args) => {
      s.clock.now += 9;
      return publish(...args);
    });
    expect((await s.run(images())).ok).toBe(true);
    const lines = logSpy.mock.calls.map((c) => String(c[0]));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\[tool\] images-to-pdf /);
    expect(lines[1]).toBe(
      '[tool-phases] images-to-pdf stage=0ms prepare=60ms read=8ms embed=0ms save=6ms publish=9ms',
    );
    expect(lines[1]).not.toMatch(/\.pdf|\//);
  });

  it('logs no phases when the job fails', async () => {
    const s = imageSetup();
    s.native.prepareImagePage.mockRejectedValueOnce(nativeError('ERR_FILE_NOT_FOUND'));
    await s.run(images());
    expect(logSpy).not.toHaveBeenCalled();
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

describe('runTool engine', () => {
  const compress = (id: string): ToolRequest => ({
    toolId: 'compress',
    inputIds: [id],
    level: 'medium',
  });
  // These tests stand their own runner in for compress (none: the "no runner" case).
  const realCompress = RUNNERS.compress;
  beforeEach(() => {
    delete RUNNERS.compress;
  });
  afterEach(() => {
    RUNNERS.compress = realCompress;
  });

  const forceNative = (s: ReturnType<typeof setup>) => {
    s.deps.caps = { js: { file: 10, total: 10 }, native: { file: 1e9, total: 1e9 } };
  };

  it('merges natively over the JS caps: every page of every input, in order', async () => {
    const rows = [row('one-page.pdf'), row('mixed-sizes.pdf')];
    const s = setup(rows);
    forceNative(s);
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    expect(outcome.ok).toBe(true);
    expect(s.native.assemblePdf).toHaveBeenCalledWith(
      'j1',
      [`file://${s.tmp}/j1/in-0.pdf`, `file://${s.tmp}/j1/in-1.pdf`],
      '[[{"i":0,"p":0,"r":0},{"i":1,"p":0,"r":0},{"i":1,"p":1,"r":0},{"i":1,"p":2,"r":0}]]',
      1,
    );
    expect(s.native.publishToolOutput.mock.calls).toEqual([
      [`file://${s.tmp}/j1/out-native-1.pdf`, 'one-page merged.pdf'],
    ]);
    expect(s.native.releaseToolDocument).toHaveBeenCalled();
    expect(s.toolFs.readBytes).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[tool\] merge \d+ms 4 pages 1 files$/),
    );
  });

  it('splits natively: the JS groups, one output each, published in order', async () => {
    const r = row('mixed-sizes.pdf');
    const s = setup([r]);
    forceNative(s);
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'ranges', ranges: '1-2, 3' },
    });
    expect(outcome.ok && outcome.outputs.length).toBe(2);
    expect(s.native.getToolPageCount).toHaveBeenCalledWith(`file://${s.tmp}/j1/in-0.pdf`);
    expect(s.native.assemblePdf).toHaveBeenCalledWith(
      'j1',
      [`file://${s.tmp}/j1/in-0.pdf`],
      '[[{"i":0,"p":0,"r":0},{"i":0,"p":1,"r":0}],[{"i":0,"p":2,"r":0}]]',
      1,
    );
    expect(s.native.publishToolOutput.mock.calls).toEqual([
      [`file://${s.tmp}/j1/out-native-1.pdf`, 'mixed-sizes pages 1-2.pdf'],
      [`file://${s.tmp}/j1/out-native-2.pdf`, 'mixed-sizes page 3.pdf'],
    ]);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[tool\] split \d+ms 3 pages 2 files$/),
    );
  });

  it('splits a decrypted input natively, counting the pages of the decrypted copy', async () => {
    const r = row('protected.pdf');
    const s = setup([r]);
    forceNative(s);
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'everyN', n: 1 },
      passwords: { 0: 'secret' },
    });
    expect(outcome.ok).toBe(true);
    expect(s.native.getToolPageCount).toHaveBeenCalledWith(`file://${s.tmp}/j1/in-0.open.pdf`);
    expect(s.native.assemblePdf).toHaveBeenCalledWith(
      'j1',
      [`file://${s.tmp}/j1/in-0.open.pdf`],
      '[[{"i":0,"p":0,"r":0}]]',
      1,
    );
  });

  it('a bad range fails natively as badPages before assembling', async () => {
    const r = row('mixed-sizes.pdf');
    const s = setup([r]);
    forceNative(s);
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'ranges', ranges: '2-9' },
    });
    expect(outcome).toMatchObject({ ok: false, failure: 'badPages' });
    expect(s.native.assemblePdf).not.toHaveBeenCalled();
  });

  it('organizes natively: page edits become refs', async () => {
    const r = row('mixed-sizes.pdf');
    const s = setup([r]);
    forceNative(s);
    const outcome = await s.run({
      toolId: 'organize',
      inputIds: [r.id],
      pages: [{ source: 2, rotate: 90 }],
    });
    expect(outcome.ok).toBe(true);
    expect(s.native.assemblePdf).toHaveBeenCalledWith(
      'j1',
      [`file://${s.tmp}/j1/in-0.pdf`],
      '[[{"i":0,"p":1,"r":90}]]',
      1,
    );
    expect(s.native.publishToolOutput.mock.calls).toEqual([
      [`file://${s.tmp}/j1/out-native-1.pdf`, 'mixed-sizes organised.pdf'],
    ]);
  });

  it('maps a native assembly failure and publishes nothing', async () => {
    const rows = [row('one-page.pdf'), row('mixed-sizes.pdf')];
    const s = setup(rows);
    forceNative(s);
    s.native.assemblePdf.mockRejectedValueOnce(nativeError('ERR_IO'));
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    expect(outcome).toEqual({ ok: false, failure: 'io', inputIndex: null, outputs: [] });
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
  });

  it('a page count failure belongs to its input', async () => {
    const rows = [row('one-page.pdf'), row('mixed-sizes.pdf')];
    const s = setup(rows);
    forceNative(s);
    s.native.getToolPageCount
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(nativeError('ERR_PDF_INVALID'));
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    expect(outcome).toEqual({ ok: false, failure: 'invalid', inputIndex: 1, outputs: [] });
    expect(s.native.assemblePdf).not.toHaveBeenCalled();
  });

  it('a cancel during native assembly ends cancelled, publishing nothing', async () => {
    const rows = [row('one-page.pdf'), row('mixed-sizes.pdf')];
    const s = setup(rows);
    forceNative(s);
    s.native.assemblePdf.mockImplementationOnce(async () => {
      s.controller.abort();
      throw nativeError('ERR_CANCELLED');
    });
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    expect(outcome).toEqual({ ok: false, failure: 'cancelled', inputIndex: null, outputs: [] });
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
  });

  it('a 3-part native split is one assembly call', async () => {
    const r = row('mixed-sizes.pdf');
    const s = setup([r]);
    forceNative(s);
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'everyN', n: 1 },
    });
    expect(outcome.ok && outcome.outputs.length).toBe(3);
    expect(s.native.assemblePdf).toHaveBeenCalledTimes(1);
    expect(s.native.assemblePdf.mock.calls[0]![3]).toBe(1);
  });

  it('a 20-part native split runs in at most 8 batches, publishing each in order', async () => {
    const r = row('two-hundred-pages.pdf');
    const s = setup([r]);
    forceNative(s);
    const real = s.native.assemblePdf.getMockImplementation()!;
    s.native.assemblePdf.mockImplementation(async (jobId, uris, json, first) => {
      // Batch 1's end: progress within a batch is scaled to its share of the processing.
      s.emitToolProgress({ jobId, fraction: 1 });
      return real(jobId, uris, json, first);
    });
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'everyN', n: 10 },
    });
    expect(outcome.ok && outcome.outputs.length).toBe(20);
    const calls = s.native.assemblePdf.mock.calls;
    expect(calls.length).toBeLessThanOrEqual(8);
    expect(calls.map((c) => c[3])).toEqual([1, 4, 7, 10, 13, 16, 19]);
    const refs = calls.flatMap((c) => JSON.parse(c[2]) as { p: number }[][]);
    expect(refs.map((g) => g[0]!.p)).toEqual(Array.from({ length: 20 }, (_, k) => k * 10));
    expect(s.native.publishToolOutput.mock.calls).toEqual(
      Array.from({ length: 20 }, (_, k) => [
        `file://${s.tmp}/j1/out-native-${k + 1}.pdf`,
        `two-hundred-pages part ${k + 1}.pdf`,
      ]),
    );
    // Batch 2 starts only after batch 1's parts are published.
    const order = [
      ...s.native.assemblePdf.mock.invocationCallOrder.map((n) => ['assemble', n] as const),
      ...s.native.publishToolOutput.mock.invocationCallOrder.map((n) => ['publish', n] as const),
    ]
      .sort((a, b) => a[1] - b[1])
      .map(([kind]) => kind);
    expect(order.slice(0, 5)).toEqual(['assemble', 'publish', 'publish', 'publish', 'assemble']);
    expect(s.events).toContainEqual(['processing', 1 / 7]);
    const phaseAt = (p: ToolPhase) => ['preparing', 'processing', 'saving'].indexOf(p);
    for (let k = 1; k < s.events.length; k++) {
      const [p0, f0] = s.events[k - 1]!;
      const [p1, f1] = s.events[k]!;
      expect(phaseAt(p1) > phaseAt(p0) || (p1 === p0 && f1 >= f0)).toBe(true);
    }
    expect(s.events[s.events.length - 1]).toEqual(['saving', 1]);
  });

  it('a cancel during native batch 2 keeps batch 1 published', async () => {
    const r = row('two-hundred-pages.pdf');
    const s = setup([r]);
    forceNative(s);
    const real = s.native.assemblePdf.getMockImplementation()!;
    s.native.assemblePdf.mockImplementationOnce(real).mockImplementationOnce(async () => {
      s.controller.abort();
      throw nativeError('ERR_CANCELLED');
    });
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'everyN', n: 10 },
    });
    expect(outcome).toMatchObject({ ok: false, failure: 'cancelled', inputIndex: null });
    expect(outcome.outputs.map((o) => o.name)).toEqual([
      'two-hundred-pages part 1.pdf',
      'two-hundred-pages part 2.pdf',
      'two-hundred-pages part 3.pdf',
    ]);
    expect(s.published).toHaveLength(3);
    expect(s.published.every((p) => fs.existsSync(p.path))).toBe(true);
    expect(s.registerOutputs).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(s.tmp, 'j1'))).toBe(false);
  });

  it('a native organise with no pages or a bad page is badPages, never assembled', async () => {
    const r = row('mixed-sizes.pdf');
    const s = setup([r]);
    forceNative(s);
    const empty = await s.run({ toolId: 'organize', inputIds: [r.id], pages: [] });
    const bad = await s.run({
      toolId: 'organize',
      inputIds: [r.id],
      pages: [{ source: 0, rotate: 0 }],
    });
    expect(empty).toMatchObject({ ok: false, failure: 'badPages' });
    expect(bad).toMatchObject({ ok: false, failure: 'badPages' });
    expect(s.native.assemblePdf).not.toHaveBeenCalled();
  });

  it('never assembles natively under the default caps', async () => {
    const rows = [row('one-page.pdf'), row('mixed-sizes.pdf')];
    const s = setup(rows);
    await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    await s.run({
      toolId: 'split',
      inputIds: [rows[1]!.id],
      split: { mode: 'ranges', ranges: '1-2, 3' },
    });
    await s.run({
      toolId: 'organize',
      inputIds: [rows[1]!.id],
      pages: [{ source: 2, rotate: 90 }],
    });
    expect(s.published).toHaveLength(4);
    expect(s.native.assemblePdf).not.toHaveBeenCalled();
  });

  it('stages PDF inputs under the native caps', async () => {
    const rows = [row('one-page.pdf', { sizeBytes: 40 * 1_048_576 }), row('mixed-sizes.pdf')];
    const s = setup(rows);
    const outcome = await s.run({ toolId: 'merge', inputIds: rows.map((r) => r.id) });
    // The staged copies are small, so merge still runs in pdf-lib.
    expect(outcome.ok).toBe(true);
    expect(s.native.stageToolInput.mock.calls.map((c) => c[3])).toEqual([536_870_912, 536_870_912]);
  });

  it('fails a runnable tool that has no runner as unknown', async () => {
    const r = row('one-page.pdf');
    const s = setup([r]);
    const outcome = await s.run(compress(r.id));
    expect(outcome).toMatchObject({ ok: false, failure: 'unknown', outputs: [] });
    expect(s.native.cleanToolWorkspace).toHaveBeenCalledWith('j1');
  });

  it('gives the runner its staged inputs, rows and route', async () => {
    const r = row('one-page.pdf');
    const s = setup([r]);
    let seen: unknown = null;
    RUNNERS.compress = async (ctx) => {
      seen = { route: ctx.route, inputs: ctx.inputs.length, row: ctx.rows[0]?.id };
    };
    const outcome = await s.run(compress(r.id));
    expect(outcome).toEqual({ ok: true, outputs: [] });
    expect(seen).toEqual({ route: 'native', inputs: 1, row: r.id });
  });

  it('on abort, waits for the native op to stop before cleaning the workspace', async () => {
    const r = row('one-page.pdf');
    const s = setup([r]);
    const order: string[] = [];
    let started!: () => void;
    const opStarted = new Promise<void>((res) => (started = res));
    let stop!: () => void;
    s.native.cancelNativeTool.mockImplementation(async () => {
      order.push('cancel');
      // The native job stops at its next page, a little later.
      setTimeout(stop, 20);
    });
    s.native.cleanToolWorkspace.mockImplementation(async () => {
      order.push('clean');
    });
    RUNNERS.compress = async (ctx) => {
      await ctx.nativeOp(
        () =>
          new Promise<never>((_, reject) => {
            stop = () => {
              order.push('op settled');
              reject(nativeError('ERR_CANCELLED'));
            };
            started();
          }),
      );
    };
    const done = s.run(compress(r.id), 'job-7');
    await opStarted;
    s.controller.abort();
    const outcome = await done;
    expect(outcome).toEqual({ ok: false, failure: 'cancelled', inputIndex: null, outputs: [] });
    expect(s.native.cancelNativeTool).toHaveBeenCalledWith('job-7');
    expect(order).toEqual(['cancel', 'op settled', 'clean']);
    expect(s.progressListeners.size).toBe(0);
  });

  it('ends cancelled after the grace delay when the native op never stops', async () => {
    const r = row('one-page.pdf');
    const s = setup([r]);
    s.deps.nativeCancelGraceMs = 30;
    let started!: () => void;
    const opStarted = new Promise<void>((res) => (started = res));
    RUNNERS.compress = async (ctx) => {
      await ctx.nativeOp(() => {
        started();
        return new Promise<never>(() => {});
      });
    };
    const done = s.run(compress(r.id), 'job-7');
    await opStarted;
    const abortedAt = Date.now();
    s.controller.abort();
    const outcome = await done;
    expect(Date.now() - abortedAt).toBeGreaterThanOrEqual(25);
    expect(s.native.cancelNativeTool).toHaveBeenCalledWith('job-7');
    expect(outcome).toEqual({ ok: false, failure: 'cancelled', inputIndex: null, outputs: [] });
    expect(s.native.cleanToolWorkspace).toHaveBeenCalledWith('job-7');
    expect(s.progressListeners.size).toBe(0);
  });

  it('ends cancelled, publishing nothing, when the op finishes despite the abort', async () => {
    const r = row('one-page.pdf');
    const s = setup([r]);
    let started!: () => void;
    const opStarted = new Promise<void>((res) => (started = res));
    let finish!: () => void;
    s.native.cancelNativeTool.mockImplementation(async () => {
      setTimeout(finish, 10);
    });
    RUNNERS.compress = async (ctx) => {
      const out = await ctx.nativeOp(
        () =>
          new Promise<{ uri: string; sizeBytes: number }>((resolve) => {
            finish = () => resolve(ctx.inputs[0]!);
            started();
          }),
      );
      await ctx.publishFile(out, 'one-page compressed.pdf', 0, 1);
    };
    const done = s.run(compress(r.id));
    await opStarted;
    s.controller.abort();
    const outcome = await done;
    expect(outcome).toEqual({ ok: false, failure: 'cancelled', inputIndex: null, outputs: [] });
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
  });

  it('nativeOp turns ERR_CANCELLED into cancelled', async () => {
    const r = row('one-page.pdf');
    const s = setup([r]);
    RUNNERS.compress = async (ctx) => {
      await ctx.nativeOp(() => Promise.reject(nativeError('ERR_CANCELLED')));
    };
    const outcome = await s.run(compress(r.id));
    expect(outcome).toMatchObject({ ok: false, failure: 'cancelled' });
  });

  it('nativeOp reports progress of its own job only, then unsubscribes', async () => {
    const r = row('one-page.pdf');
    const s = setup([r]);
    RUNNERS.compress = async (ctx) => {
      await ctx.nativeOp(async () => {
        s.emitToolProgress({ jobId: 'other', fraction: 0.5 });
        s.emitToolProgress({ jobId: 'j1', fraction: 0.5 });
        return 1;
      });
    };
    const outcome = await s.run(compress(r.id));
    expect(outcome.ok).toBe(true);
    expect(s.events.filter(([p]) => p === 'processing')).toEqual([
      ['processing', 0],
      ['processing', 0.5],
    ]);
    expect(s.progressListeners.size).toBe(0);
  });

  it('publishFile publishes a workspace file and setExtras reaches the outcome', async () => {
    const r = row('one-page.pdf');
    const s = setup([r]);
    RUNNERS.compress = async (ctx) => {
      const input = ctx.inputs[0]!;
      await ctx.publishFile(input, 'one-page compressed.pdf', 0, 1);
      ctx.setExtras({ sizes: { before: 10, after: 5 } });
    };
    const outcome = await s.run(compress(r.id));
    expect(outcome).toMatchObject({ ok: true, extras: { sizes: { before: 10, after: 5 } } });
    expect(s.published.map((p) => p.name)).toEqual(['one-page compressed.pdf']);
    expect(s.recordOutput).toHaveBeenCalledTimes(1);
  });
});

describe('runTool locked inputs', () => {
  const realCompress = RUNNERS.compress;
  const realUnlock = RUNNERS.unlock;
  afterEach(() => {
    RUNNERS.compress = realCompress;
    RUNNERS.unlock = realUnlock;
  });

  it('unlocks a protected input with its password, then splits the decrypted copy', async () => {
    const r = row('protected.pdf');
    const s = setup([r]);
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'ranges', ranges: '1' },
      passwords: { 0: 'secret' },
    });
    expect(outcome).toMatchObject({ ok: true, extras: { passwordRemoved: true } });
    expect(s.native.unlockToolInput).toHaveBeenCalledWith(
      `file://${s.tmp}/j1/in-0.pdf`,
      'j1',
      0,
      'secret',
    );
    expect(s.toolFs.readBytes).toHaveBeenCalledWith(`file://${s.tmp}/j1/in-0.open.pdf`);
    expect(s.toolFs.readBytes).not.toHaveBeenCalledWith(`file://${s.tmp}/j1/in-0.pdf`);
    expect(s.published.map((p) => p.name)).toEqual(['protected page 1.pdf']);
    const logged = logSpy.mock.calls.map((c) => String(c[0]));
    expect(logged.some((l) => l.startsWith('[tool] split'))).toBe(true);
    for (const line of logged) expect(line).not.toContain('secret');
  });

  it('fails a protected input without a password as encrypted at its index', async () => {
    const r = row('protected.pdf');
    const s = setup([r]);
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'ranges', ranges: '1' },
    });
    expect(outcome).toEqual({ ok: false, failure: 'encrypted', inputIndex: 0, outputs: [] });
    expect(s.native.unlockToolInput).toHaveBeenCalledWith(
      `file://${s.tmp}/j1/in-0.pdf`,
      'j1',
      0,
      null,
    );
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
  });

  it('maps a wrong password to wrongPassword and a restricted input to restricted', async () => {
    const p = row('protected.pdf');
    const s = setup([p]);
    const split = { mode: 'ranges', ranges: '1' } as const;
    expect(
      await s.run({ toolId: 'split', inputIds: [p.id], split, passwords: { 0: 'nope' } }),
    ).toEqual({ ok: false, failure: 'wrongPassword', inputIndex: 0, outputs: [] });

    const o = row('owner-only.pdf');
    const s2 = setup([o]);
    expect(await s2.run({ toolId: 'split', inputIds: [o.id], split })).toEqual({
      ok: false,
      failure: 'restricted',
      inputIndex: 0,
      outputs: [],
    });
  });

  it('unlocks only the locked input of a merge, by its own index', async () => {
    const rows = [row('one-page.pdf'), row('protected.pdf')];
    const s = setup(rows);
    const outcome = await s.run({
      toolId: 'merge',
      inputIds: rows.map((x) => x.id),
      passwords: { 1: 'secret' },
    });
    expect(outcome).toMatchObject({ ok: true, extras: { passwordRemoved: true } });
    expect(s.native.inspectPdf).toHaveBeenCalledTimes(2);
    expect(s.native.unlockToolInput).toHaveBeenCalledTimes(1);
    expect(s.native.unlockToolInput).toHaveBeenCalledWith(
      `file://${s.tmp}/j1/in-1.pdf`,
      'j1',
      1,
      'secret',
    );
    const doc = await loadStrict(new Uint8Array(fs.readFileSync(s.published[0]!.path)));
    expect(doc.getPageCount()).toBe(2);
  });

  it('leaves unlocked inputs alone and reports no removed password', async () => {
    const r = row('one-page.pdf');
    const s = setup([r]);
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'ranges', ranges: '1' },
    });
    expect(outcome).toEqual({ ok: true, outputs: expect.any(Array) });
    expect(s.native.unlockToolInput).not.toHaveBeenCalled();
  });

  it('decrypts an input that opens with the empty password without asking', async () => {
    const r = row('one-page.pdf');
    const s = setup([r]);
    s.native.inspectPdf.mockResolvedValue('open');
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'ranges', ranges: '1' },
    });
    expect(outcome).toMatchObject({ ok: true, extras: { passwordRemoved: true } });
    expect(s.native.unlockToolInput).toHaveBeenCalledWith(expect.any(String), 'j1', 0, null);
  });

  it('gives the runner each input lock and keeps extras it adds', async () => {
    const r = row('protected.pdf');
    const s = setup([r]);
    let locks: unknown = null;
    RUNNERS.compress = async (ctx) => {
      locks = ctx.locks;
      ctx.setExtras({ sizes: { before: 10, after: 5 } });
    };
    const outcome = await s.run({
      toolId: 'compress',
      inputIds: [r.id],
      level: 'medium',
      passwords: { 0: 'secret' },
    });
    expect(locks).toEqual(['password']);
    expect(outcome).toMatchObject({
      ok: true,
      extras: { passwordRemoved: true, sizes: { before: 10, after: 5 } },
    });
  });

  it('Remove password reports no removed-password note (its output is the point)', async () => {
    const r = row('protected.pdf');
    const s = setup([r]);
    let locks: unknown = null;
    RUNNERS.unlock = async (ctx) => {
      locks = ctx.locks;
    };
    const outcome = await s.run({ toolId: 'unlock', inputIds: [r.id], passwords: { 0: 'secret' } });
    expect(locks).toEqual(['password']);
    expect(outcome).toEqual({ ok: true, outputs: [] });
  });

  it('a failed inspect fails the job at that input', async () => {
    const r = row('one-page.pdf');
    const s = setup([r]);
    s.native.inspectPdf.mockRejectedValue(nativeError('ERR_PDF_INVALID'));
    const outcome = await s.run({
      toolId: 'split',
      inputIds: [r.id],
      split: { mode: 'ranges', ranges: '1' },
    });
    expect(outcome).toEqual({ ok: false, failure: 'invalid', inputIndex: 0, outputs: [] });
  });
});

describe('runTool compress', () => {
  it('compresses natively at the chosen level and reports the sizes', async () => {
    const r = row('one-page.pdf', { sizeBytes: 1000 });
    const s = setup([r]);
    const outcome = await s.run({ toolId: 'compress', inputIds: [r.id], level: 'high' });
    expect(s.native.compressPdf).toHaveBeenCalledWith(`file://${s.tmp}/j1/in-0.pdf`, 'j1', 'high');
    expect(s.native.publishToolOutput).toHaveBeenCalledWith(
      `file://${s.tmp}/j1/out-compressed.pdf`,
      'one-page compressed.pdf',
    );
    expect(outcome).toMatchObject({ ok: true, extras: { sizes: { before: 1000, after: 400 } } });
    expect(outcome.outputs).toHaveLength(1);
  });

  it('uses the staged size when the row size is unknown', async () => {
    const r = row('one-page.pdf', { sizeBytes: Number.NaN });
    const s = setup([r]);
    const outcome = await s.run({ toolId: 'compress', inputIds: [r.id], level: 'medium' });
    const staged = fs.statSync(path.join(FIXTURES, 'one-page.pdf')).size;
    expect(outcome).toMatchObject({ ok: true, extras: { sizes: { before: staged, after: 400 } } });
  });

  it('a cancelled compress ends cancelled and publishes nothing', async () => {
    const r = row('one-page.pdf');
    const s = setup([r]);
    s.native.compressPdf.mockRejectedValue(nativeError('ERR_CANCELLED'));
    const outcome = await s.run({ toolId: 'compress', inputIds: [r.id], level: 'low' });
    expect(outcome).toEqual({ ok: false, failure: 'cancelled', inputIndex: null, outputs: [] });
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
  });

  it('a damaged input fails as invalid at its index', async () => {
    const r = row('one-page.pdf');
    const s = setup([r]);
    s.native.compressPdf.mockRejectedValue(nativeError('ERR_PDF_INVALID'));
    const outcome = await s.run({ toolId: 'compress', inputIds: [r.id], level: 'low' });
    expect(outcome).toEqual({ ok: false, failure: 'invalid', inputIndex: 0, outputs: [] });
  });
});

describe('runTool protect and unlock', () => {
  it('protects an unlocked input with the new password', async () => {
    const r = row('one-page.pdf');
    const s = setup([r]);
    const outcome = await s.run({
      toolId: 'protect',
      inputIds: [r.id],
      newPassword: 'hunter22',
    });
    expect(outcome).toMatchObject({ ok: true });
    expect(outcome.ok && outcome.extras).toBeFalsy();
    expect(s.native.protectPdf).toHaveBeenCalledWith(
      `file://${s.tmp}/j1/in-0.pdf`,
      'j1',
      'hunter22',
    );
    expect(s.native.unlockToolInput).not.toHaveBeenCalled();
    expect(s.published.map((p) => p.name)).toEqual(['one-page protected.pdf']);
    for (const call of logSpy.mock.calls) expect(String(call[0])).not.toContain('hunter22');
  });

  it('unlocks a locked input first, then protects the decrypted copy', async () => {
    const r = row('protected.pdf');
    const s = setup([r]);
    const outcome = await s.run({
      toolId: 'protect',
      inputIds: [r.id],
      newPassword: 'hunter22',
      passwords: { 0: 'secret' },
    });
    expect(outcome).toMatchObject({ ok: true });
    expect(outcome.ok && outcome.extras?.passwordRemoved).toBeFalsy();
    expect(s.native.unlockToolInput).toHaveBeenCalledWith(
      `file://${s.tmp}/j1/in-0.pdf`,
      'j1',
      0,
      'secret',
    );
    expect(s.native.protectPdf).toHaveBeenCalledWith(
      `file://${s.tmp}/j1/in-0.open.pdf`,
      'j1',
      'hunter22',
    );
    expect(s.published.map((p) => p.name)).toEqual(['protected protected.pdf']);
  });

  it('removes a password: publishes the decrypted copy as unlocked', async () => {
    const r = row('protected.pdf');
    const s = setup([r]);
    const outcome = await s.run({ toolId: 'unlock', inputIds: [r.id], passwords: { 0: 'secret' } });
    expect(outcome).toMatchObject({ ok: true });
    expect(outcome.ok && outcome.extras?.passwordRemoved).toBeFalsy();
    expect(s.native.publishToolOutput).toHaveBeenCalledWith(
      `file://${s.tmp}/j1/in-0.open.pdf`,
      'protected unlocked.pdf',
    );
  });

  it('fails an unlock of a PDF with no password as notProtected', async () => {
    const r = row('one-page.pdf');
    const s = setup([r]);
    const outcome = await s.run({ toolId: 'unlock', inputIds: [r.id] });
    expect(outcome).toEqual({ ok: false, failure: 'notProtected', inputIndex: 0, outputs: [] });
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
  });

  it('fails an unlock with a wrong password for its input', async () => {
    const r = row('protected.pdf');
    const s = setup([r]);
    const outcome = await s.run({ toolId: 'unlock', inputIds: [r.id], passwords: { 0: 'nope' } });
    expect(outcome).toMatchObject({ ok: false, failure: 'wrongPassword', inputIndex: 0 });
  });
});

describe('runTool pdf to images', () => {
  // Three pages (A4, landscape letter, rotated A4) staged as "Report.pdf".
  const report = () =>
    row('Report.pdf', { uri: 'file:///storage/emulated/0/Download/mixed-sizes.pdf' });

  it('renders every page and saves each to the gallery folder', async () => {
    const r = report();
    const s = setup([r]);
    const outcome = await s.run({
      toolId: 'pdf-to-images',
      inputIds: [r.id],
      format: 'jpg',
      dpi: 150,
      pages: null,
    });
    expect(s.native.renderPdfPage.mock.calls).toEqual([
      [`file://${s.tmp}/j1/in-0.pdf`, 'j1', 1, 150, 'jpg'],
      [`file://${s.tmp}/j1/in-0.pdf`, 'j1', 2, 150, 'jpg'],
      [`file://${s.tmp}/j1/in-0.pdf`, 'j1', 3, 150, 'jpg'],
    ]);
    expect(s.native.publishImageOutput.mock.calls).toEqual([
      [`file://${s.tmp}/j1/img-1.jpg`, 'Report p1.jpg', 'Report pages'],
      [`file://${s.tmp}/j1/img-2.jpg`, 'Report p2.jpg', 'Report pages'],
      [`file://${s.tmp}/j1/img-3.jpg`, 'Report p3.jpg', 'Report pages'],
    ]);
    expect(s.native.releasePageExport).toHaveBeenCalledTimes(1);
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      ok: true,
      outputs: [],
      extras: {
        images: {
          count: 3,
          folder: 'Pictures/PDFToolkit/Report pages',
          uris: [1, 2, 3].map((n) => `content://media/external/images/media/${n}`),
          reducedPages: 0,
        },
      },
    });
    expect(s.events.filter(([p]) => p === 'processing').map(([, f]) => f)).toEqual(
      expect.arrayContaining([1 / 3, 2 / 3, 1]),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[tool\] pdf-to-images \d+ms 3 pages 0 files$/),
    );
    expect(fs.existsSync(path.join(s.tmp, 'j1'))).toBe(false);
  });

  it('renders only the chosen pages', async () => {
    const r = report();
    const s = setup([r]);
    const outcome = await s.run({
      toolId: 'pdf-to-images',
      inputIds: [r.id],
      format: 'png',
      dpi: 300,
      pages: [2],
    });
    expect(s.native.renderPdfPage).toHaveBeenCalledTimes(1);
    expect(s.native.renderPdfPage).toHaveBeenCalledWith(
      `file://${s.tmp}/j1/in-0.pdf`,
      'j1',
      2,
      300,
      'png',
    );
    expect(s.savedImages).toEqual([{ name: 'Report p2.png', folder: 'Report pages' }]);
    expect(outcome).toMatchObject({ ok: true, extras: { images: { count: 1 } } });
  });

  it('reports the folder the gallery save actually used', async () => {
    const r = report();
    const s = setup([r]);
    // Native cleans and shortens the folder; the result must show that one, not the JS name.
    s.native.publishImageOutput.mockImplementation(async (tempUri, fileName) => {
      fs.rmSync(tempPathOf(tempUri));
      return {
        uri: 'content://media/external/images/media/9',
        name: fileName,
        folder: 'Pictures/PDFToolkit/Rep_ort pa',
      };
    });
    const outcome = await s.run({
      toolId: 'pdf-to-images',
      inputIds: [r.id],
      format: 'jpg',
      dpi: 72,
      pages: [1],
    });
    expect(outcome).toMatchObject({
      ok: true,
      extras: { images: { count: 1, folder: 'Pictures/PDFToolkit/Rep_ort pa' } },
    });
  });

  it('refuses pages outside the PDF', async () => {
    const r = report();
    const s = setup([r]);
    const outcome = await s.run({
      toolId: 'pdf-to-images',
      inputIds: [r.id],
      format: 'jpg',
      dpi: 72,
      pages: [4],
    });
    expect(outcome).toMatchObject({ ok: false, failure: 'badPages' });
    expect(s.native.renderPdfPage).not.toHaveBeenCalled();
  });

  it('a cancel after the first page keeps the image already saved', async () => {
    const r = report();
    const s = setup([r]);
    s.native.publishImageOutput.mockImplementationOnce(async (tempUri, fileName, folder) => {
      fs.rmSync(tempPathOf(tempUri));
      s.savedImages.push({ name: fileName, folder });
      s.controller.abort();
      return {
        uri: 'content://media/external/images/media/1',
        name: fileName,
        folder: `Pictures/PDFToolkit/${folder}`,
      };
    });
    const outcome = await s.run({
      toolId: 'pdf-to-images',
      inputIds: [r.id],
      format: 'jpg',
      dpi: 150,
      pages: null,
    });
    expect(outcome).toEqual({
      ok: false,
      failure: 'cancelled',
      inputIndex: null,
      outputs: [],
      extras: {
        images: {
          count: 1,
          folder: 'Pictures/PDFToolkit/Report pages',
          uris: ['content://media/external/images/media/1'],
          reducedPages: 0,
        },
      },
    });
    expect(s.native.renderPdfPage).toHaveBeenCalledTimes(1);
    expect(s.native.releasePageExport).toHaveBeenCalledTimes(1);
  });

  it('counts the pages saved at a lower resolution', async () => {
    const r = report();
    const s = setup([r]);
    s.native.renderPdfPage.mockImplementation(async (_uri, jobId, page, _dpi, format) => {
      const dest = path.join(s.tmp, jobId, `img-${page}.${format}`);
      fs.writeFileSync(dest, new Uint8Array(10));
      return { uri: `file://${dest}`, page, width: 10, height: 10, reduced: page === 2 };
    });
    const outcome = await s.run({
      toolId: 'pdf-to-images',
      inputIds: [r.id],
      format: 'jpg',
      dpi: 300,
      pages: null,
    });
    expect(outcome).toMatchObject({ ok: true, extras: { images: { count: 3, reducedPages: 1 } } });
  });

  it('a refused gallery write fails as permission', async () => {
    const r = report();
    const s = setup([r]);
    s.native.publishImageOutput.mockRejectedValue(nativeError('ERR_PERMISSION_DENIED'));
    const outcome = await s.run({
      toolId: 'pdf-to-images',
      inputIds: [r.id],
      format: 'jpg',
      dpi: 150,
      pages: null,
    });
    expect(outcome).toMatchObject({ ok: false, failure: 'permission', inputIndex: null });
    expect(s.native.releasePageExport).toHaveBeenCalledTimes(1);
  });

  it('renders the decrypted copy of a protected input', async () => {
    const r = row('protected.pdf');
    const s = setup([r]);
    const outcome = await s.run({
      toolId: 'pdf-to-images',
      inputIds: [r.id],
      format: 'jpg',
      dpi: 72,
      pages: null,
      passwords: { 0: 'secret' },
    });
    expect(s.native.renderPdfPage).toHaveBeenCalledWith(
      `file://${s.tmp}/j1/in-0.open.pdf`,
      'j1',
      1,
      72,
      'jpg',
    );
    expect(s.savedImages).toEqual([{ name: 'protected p1.jpg', folder: 'protected pages' }]);
    expect(outcome).toMatchObject({ ok: true, extras: { images: { count: 1 } } });
  });
});

describe('runTool watermark and page numbers', () => {
  const textWatermark: WatermarkOptions = {
    source: { kind: 'text', text: 'DRAFT', color: 'grey' },
    opacity: 0.35,
    angle: 45,
    size: 'medium',
    position: 'center',
    pages: null,
  };

  it('renders a text watermark and stamps it on every page in pdf-lib', async () => {
    const r = row('one-page.pdf');
    const s = setup([r]);
    const outcome = await s.run({
      toolId: 'watermark',
      inputIds: [r.id],
      watermark: textWatermark,
    });
    expect(s.native.renderTextStamp).toHaveBeenCalledWith('j1', 'DRAFT', 0xff808080, 256);
    expect(s.native.stampPdf).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(true);
    expect(s.published.map((p) => p.name)).toEqual(['one-page watermarked.pdf']);
    const pages = await inspectImages(new Uint8Array(fs.readFileSync(s.published[0]!.path)));
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(page.images).toEqual(
        expect.arrayContaining([expect.objectContaining({ width: 200 })]),
      );
    }
  });

  it('stamps natively over the JS caps with the same spec, never in pdf-lib', async () => {
    const applyStamps = jest.spyOn(stampModule, 'applyStamps');
    const r = row('mixed-sizes.pdf');
    const s = setup([r]);
    s.deps.caps = { js: { file: 10, total: 10 }, native: { file: 1e9, total: 1e9 } };
    const opts: WatermarkOptions = { ...textWatermark, position: 'top-right', pages: [1, 3] };
    const outcome = await s.run({ toolId: 'watermark', inputIds: [r.id], watermark: opts });
    expect(outcome.ok).toBe(true);
    expect(s.native.stampPdf).toHaveBeenCalledTimes(1);
    const [input, jobId, json] = s.native.stampPdf.mock.calls[0]!;
    expect(input).toBe(`file://${s.tmp}/j1/in-0.pdf`);
    expect(jobId).toBe('j1');
    expect(JSON.parse(json)).toEqual(watermarkSpec(opts, `file://${s.tmp}/j1/stamp-text.png`));
    expect(s.native.publishToolOutput).toHaveBeenCalledWith(
      `file://${s.tmp}/j1/out-stamped.pdf`,
      'mixed-sizes watermarked.pdf',
    );
    expect(applyStamps).not.toHaveBeenCalled();
    expect(s.toolFs.readBytes).not.toHaveBeenCalled();
  });

  it('prepares an image watermark from its session source', async () => {
    const r = row('one-page.pdf');
    const s = setup([r], ['alpha-200x100.png', 'alpha-200x100.png']);
    const outcome = await s.run({
      toolId: 'watermark',
      inputIds: [r.id],
      watermark: { ...textWatermark, source: { kind: 'image', sessionId: 'img-1', index: 1 } },
    });
    expect(outcome.ok).toBe(true);
    expect(s.native.prepareStampImage).toHaveBeenCalledWith('img-1', 1, 'j1', 1600);
    expect(s.native.renderTextStamp).not.toHaveBeenCalled();
  });

  it('an image watermark whose session is gone fails as imagesGone', async () => {
    const r = row('one-page.pdf');
    const s = setup([r], []);
    const outcome = await s.run({
      toolId: 'watermark',
      inputIds: [r.id],
      watermark: { ...textWatermark, source: { kind: 'image', sessionId: 'img-1', index: 0 } },
    });
    expect(outcome).toEqual({ ok: false, failure: 'imagesGone', inputIndex: null, outputs: [] });
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
  });

  it('numbers 200 pages as "Page n of 200" in pdf-lib', async () => {
    const r = row('two-hundred-pages.pdf');
    const s = setup([r]);
    const outcome = await s.run({
      toolId: 'page-numbers',
      inputIds: [r.id],
      numbers: {
        position: 'bottom-right',
        format: 'pageOfTotal',
        start: 1,
        fontSize: 12,
        pages: null,
      },
    });
    expect(outcome.ok).toBe(true);
    expect(s.native.stampPdf).not.toHaveBeenCalled();
    expect(s.published.map((p) => p.name)).toEqual(['two-hundred-pages numbered.pdf']);
    const pages = await inspectPages(new Uint8Array(fs.readFileSync(s.published[0]!.path)));
    expect(pages).toHaveLength(200);
    expect(pages[0]!.text).toContain('Page 1 of 200');
    expect(pages[199]!.text).toContain('Page 200 of 200');
  });

  it('numbers natively with the plain "{n}" template', async () => {
    const r = row('mixed-sizes.pdf');
    const s = setup([r]);
    s.deps.caps = { js: { file: 10, total: 10 }, native: { file: 1e9, total: 1e9 } };
    const outcome = await s.run({
      toolId: 'page-numbers',
      inputIds: [r.id],
      numbers: { position: 'top-left', format: 'n', start: 5, fontSize: 10, pages: [2] },
    });
    expect(outcome.ok).toBe(true);
    expect(JSON.parse(s.native.stampPdf.mock.calls[0]![2])).toEqual({
      stamps: [
        {
          kind: 'text',
          template: '{n}',
          start: 5,
          pages: [2],
          position: 'top-left',
          fontSize: 10,
          marginPt: 28,
        },
      ],
    });
    expect(s.native.publishToolOutput).toHaveBeenCalledWith(
      `file://${s.tmp}/j1/out-stamped.pdf`,
      'mixed-sizes numbered.pdf',
    );
  });
});

describe('runTool sign', () => {
  const placements: SignaturePlacement[] = [
    { signatureId: 7, page: 1, cx: 0.3, cy: 0.4, width: 0.3 },
    { signatureId: 7, page: 3, cx: 0.72, cy: 0.85, width: 0.25 },
  ];

  it('stamps the saved signature on pages 1 and 3 in pdf-lib, never on page 2', async () => {
    const r = row('mixed-sizes.pdf');
    const s = setup([r]);
    const outcome = await s.run({ toolId: 'sign', inputIds: [r.id], placements });
    expect(outcome.ok).toBe(true);
    expect(s.native.stampPdf).not.toHaveBeenCalled();
    expect(s.getSignaturePng).toHaveBeenCalledWith(7);
    expect(s.published.map((p) => p.name)).toEqual(['mixed-sizes signed.pdf']);
    const pages = await inspectImages(new Uint8Array(fs.readFileSync(s.published[0]!.path)));
    expect(pages).toHaveLength(3);
    const signature = expect.objectContaining({ width: 200, height: 100 });
    expect(pages[0]!.images).toEqual(expect.arrayContaining([signature]));
    expect(pages[1]!.images).not.toEqual(expect.arrayContaining([signature]));
    expect(pages[2]!.images).toEqual(expect.arrayContaining([signature]));
    // The saved signature itself is never touched.
    expect(fs.existsSync(s.signaturePng)).toBe(true);
  });

  it('a placed signature that was deleted fails as signatureGone', async () => {
    const r = row('mixed-sizes.pdf');
    const s = setup([r]);
    s.getSignaturePng.mockReturnValue(null);
    const outcome = await s.run({ toolId: 'sign', inputIds: [r.id], placements });
    expect(outcome).toEqual({ ok: false, failure: 'signatureGone', inputIndex: null, outputs: [] });
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
  });

  it('a signature file that is gone from disk fails as signatureGone', async () => {
    const r = row('mixed-sizes.pdf');
    const s = setup([r]);
    fs.rmSync(s.signaturePng);
    const outcome = await s.run({ toolId: 'sign', inputIds: [r.id], placements });
    expect(outcome).toEqual({ ok: false, failure: 'signatureGone', inputIndex: null, outputs: [] });
  });

  it('stamps natively over the JS caps with centre anchors and a copy in the job workspace', async () => {
    const r = row('mixed-sizes.pdf');
    const s = setup([r]);
    s.deps.caps = { js: { file: 10, total: 10 }, native: { file: 1e9, total: 1e9 } };
    const copies: { uri: string; bytes: Buffer }[] = [];
    const stampImpl = s.native.stampPdf.getMockImplementation()!;
    s.native.stampPdf.mockImplementationOnce(async (fileUri, jobId, json) => {
      for (const stamp of (JSON.parse(json) as { stamps: { png: string }[] }).stamps) {
        copies.push({ uri: stamp.png, bytes: fs.readFileSync(tempPathOf(stamp.png)) });
      }
      return stampImpl(fileUri, jobId, json);
    });
    const outcome = await s.run({ toolId: 'sign', inputIds: [r.id], placements });
    expect(outcome.ok).toBe(true);
    const [input, jobId, json] = s.native.stampPdf.mock.calls[0]!;
    expect(input).toBe(`file://${s.tmp}/j1/in-0.pdf`);
    expect(jobId).toBe('j1');
    const spec = JSON.parse(json) as { stamps: { png: string }[] };
    const png = spec.stamps[0]!.png;
    // PdfStamper only takes PNGs of the job's own workspace: the saved PNG is copied there.
    expect(png.startsWith(`file://${s.tmp}/j1/`)).toBe(true);
    expect(spec).toEqual(signatureSpec(placements, () => png));
    expect(spec).toEqual({
      stamps: [
        {
          kind: 'image',
          png,
          pages: [1],
          anchor: { cx: 0.3, cy: 0.4 },
          widthFrac: 0.3,
          angle: 0,
          opacity: 1,
        },
        {
          kind: 'image',
          png,
          pages: [3],
          anchor: { cx: 0.72, cy: 0.85 },
          widthFrac: 0.25,
          angle: 0,
          opacity: 1,
        },
      ],
    });
    expect(copies.map((c) => c.uri)).toEqual([png, png]);
    expect(copies[0]!.bytes.equals(fs.readFileSync(s.signaturePng))).toBe(true);
    expect(s.native.publishToolOutput).toHaveBeenCalledWith(
      `file://${s.tmp}/j1/out-stamped.pdf`,
      'mixed-sizes signed.pdf',
    );
  });

  it('copies each distinct signature once', async () => {
    const r = row('mixed-sizes.pdf');
    const s = setup([r]);
    s.getSignaturePng.mockImplementation((id) =>
      id === 7 || id === 8 ? `file://${s.signaturePng}` : null,
    );
    s.deps.caps = { js: { file: 10, total: 10 }, native: { file: 1e9, total: 1e9 } };
    const outcome = await s.run({
      toolId: 'sign',
      inputIds: [r.id],
      placements: [...placements, { signatureId: 8, page: 2, cx: 0.5, cy: 0.5, width: 0.2 }],
    });
    expect(outcome.ok).toBe(true);
    const spec = JSON.parse(s.native.stampPdf.mock.calls[0]![2]) as { stamps: { png: string }[] };
    const pngs = spec.stamps.map((st) => st.png);
    expect(pngs[0]).toBe(pngs[1]);
    expect(pngs[2]).not.toBe(pngs[0]);
    expect(s.getSignaturePng.mock.calls.map(([id]) => id).sort()).toEqual([7, 8]);
  });

  it('refuses no placements or more than 50', async () => {
    const r = row('mixed-sizes.pdf');
    const s = setup([r]);
    const none = await s.run({ toolId: 'sign', inputIds: [r.id], placements: [] });
    expect(none).toEqual(expect.objectContaining({ ok: false, failure: 'badPages' }));
    const many = Array.from({ length: 51 }, () => placements[0]!);
    const tooMany = await s.run({ toolId: 'sign', inputIds: [r.id], placements: many }, 'j2');
    expect(tooMany).toEqual(expect.objectContaining({ ok: false, failure: 'badPages' }));
    expect(s.native.publishToolOutput).not.toHaveBeenCalled();
  });
});
