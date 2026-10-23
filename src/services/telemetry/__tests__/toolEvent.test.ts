import type { ImagesRequest, ToolOutcome, ToolRequest } from '@/services/tools/runTool';
import { makeRow } from '@/test-utils/fileRows';

import { pagesOf, toolFinishedEvent } from '../toolEvent';

const merge: ToolRequest = {
  toolId: 'merge',
  inputIds: ['Salary-2026.pdf', '/storage/emulated/0/Download/Salary-2026.pdf'],
};
const scan: ImagesRequest = {
  toolId: 'scan',
  inputIds: [],
  sessionId: 'img-s1',
  images: [0, 1, 2],
  filter: 'colour',
  layout: { pageSize: 'a4', orientation: 'auto', margin: 'small' },
  name: 'My secret',
  quality: 'standard',
};

describe('toolFinishedEvent', () => {
  it('describes a failed merge with enums and numbers only', () => {
    const outcome: ToolOutcome = {
      ok: false,
      failure: 'notFound',
      inputIndex: 0,
      outputs: [],
    };
    const event = toolFinishedEvent(merge, outcome, 1349, 0);
    expect(event.name).toBe('tool_finished');
    expect(event.params).toEqual({
      tool: 'merge',
      result: 'failed',
      failure: 'notFound',
      duration_ms: 1300,
      inputs: 2,
      pages_bucket: '0',
    });
    const json = JSON.stringify(event);
    expect(json).not.toContain('.pdf');
    expect(json).not.toContain('/');
    expect(json).not.toContain('Salary');
  });

  it('never carries a typed scan name and counts images as inputs', () => {
    const out = makeRow({ name: 'My secret.pdf', source: 'output', pageCount: 3 });
    const event = toolFinishedEvent(scan, { ok: true, outputs: [out] }, 2050, 3);
    expect(JSON.stringify(event)).not.toContain('secret');
    expect(event.params).toEqual({
      tool: 'scan',
      result: 'success',
      failure: 'none',
      duration_ms: 2100,
      inputs: 3,
      pages_bucket: '1-10',
    });
  });

  it('reports a cancelled job as cancelled with no failure', () => {
    const outcome: ToolOutcome = { ok: false, failure: 'cancelled', inputIndex: null, outputs: [] };
    expect(toolFinishedEvent(merge, outcome, 40, 0).params).toMatchObject({
      result: 'cancelled',
      failure: 'none',
      duration_ms: 0,
    });
  });

  it('never reports a negative duration', () => {
    expect(toolFinishedEvent(merge, { ok: true, outputs: [] }, -500, 0).params.duration_ms).toBe(0);
  });

  it.each([
    [0, '0'],
    [1, '1-10'],
    [10, '1-10'],
    [11, '11-50'],
    [50, '11-50'],
    [51, '51-200'],
    [200, '51-200'],
    [201, '200+'],
  ])('buckets %d pages as %s', (pages, bucket) => {
    expect(toolFinishedEvent(merge, { ok: true, outputs: [] }, 0, pages).params.pages_bucket).toBe(
      bucket,
    );
  });
});

describe('pagesOf', () => {
  it('sums the output page counts, an unknown count as 0', () => {
    const outputs = [
      makeRow({ name: 'a.pdf', pageCount: 4 }),
      makeRow({ name: 'b.pdf', pageCount: null }),
      makeRow({ name: 'c.pdf', pageCount: 7 }),
    ];
    expect(pagesOf({ ok: true, outputs })).toBe(11);
    expect(pagesOf({ ok: false, failure: 'io', inputIndex: null, outputs: [] })).toBe(0);
  });
});
