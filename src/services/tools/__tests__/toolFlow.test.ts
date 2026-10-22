/** @jest-environment node */
import { makeRow } from '@/test-utils/fileRows';

import { toolById, type ToolDef } from '../toolRegistry';
import {
  canContinue,
  initialFlow,
  parseInputsParam,
  pruneFlow,
  toggleSelection,
} from '../toolFlow';

const merge = toolById('merge') as ToolDef;
const split = toolById('split') as ToolDef;
const A = '0123456789abcdef';
const B = 'fedcba9876543210';

describe('parseInputsParam', () => {
  it('keeps only distinct 16-hex ids', () => {
    expect(parseInputsParam(`${A},../x,${A}`)).toEqual([A]);
  });
  it('accepts repeated params and nothing', () => {
    expect(parseInputsParam([A, `${B},ZZ`])).toEqual([A, B]);
    expect(parseInputsParam(undefined)).toEqual([]);
    expect(parseInputsParam('')).toEqual([]);
  });
});

describe('initialFlow', () => {
  it('opens options for a valid prefilled count', () => {
    expect(initialFlow(merge, [A, B])).toEqual({ step: 'options', selectedIds: [A, B] });
    expect(initialFlow(split, [A])).toEqual({ step: 'options', selectedIds: [A] });
  });
  it('starts at pick otherwise, keeping ids up to the maximum', () => {
    expect(initialFlow(merge, [A])).toEqual({ step: 'pick', selectedIds: [A] });
    expect(initialFlow(split, [A, B])).toEqual({ step: 'pick', selectedIds: [A] });
    expect(initialFlow(merge, [])).toEqual({ step: 'pick', selectedIds: [] });
  });
});

describe('toggleSelection', () => {
  it('adds and removes for multi-input tools', () => {
    const s = toggleSelection({ step: 'pick', selectedIds: [A] }, B, merge);
    expect(s.selectedIds).toEqual([A, B]);
    expect(toggleSelection(s, A, merge).selectedIds).toEqual([B]);
  });
  it('replaces the selection for single-input tools', () => {
    expect(toggleSelection({ step: 'pick', selectedIds: [A] }, B, split).selectedIds).toEqual([B]);
    expect(toggleSelection({ step: 'pick', selectedIds: [A] }, A, split).selectedIds).toEqual([]);
  });
  it('does not grow past the maximum', () => {
    const ids = Array.from({ length: 50 }, (_, i) => i.toString(16).padStart(16, '0'));
    const s = toggleSelection({ step: 'pick', selectedIds: ids }, A, merge);
    expect(s.selectedIds).toHaveLength(50);
    expect(s.selectedIds).not.toContain(A);
  });
});

describe('canContinue', () => {
  const rows = ['a', 'b', 'c', 'd'].map((n) => makeRow({ name: `${n}.pdf` }));
  const ids = rows.map((r) => r.id);
  it('needs the minimum count', () => {
    expect(canContinue({ step: 'pick', selectedIds: [ids[0]!] }, merge, rows)).toBe(false);
    expect(canContinue({ step: 'pick', selectedIds: ids.slice(0, 2) }, merge, rows)).toBe(true);
    expect(canContinue({ step: 'pick', selectedIds: [] }, split, rows)).toBe(false);
    expect(canContinue({ step: 'pick', selectedIds: [ids[0]!] }, split, rows)).toBe(true);
  });
  it('rejects a row over the per-file cap', () => {
    const big = makeRow({ name: 'big.pdf', sizeBytes: 31 * 1024 * 1024 });
    expect(canContinue({ step: 'pick', selectedIds: [big.id] }, split, [big])).toBe(false);
  });
  it('rejects a total over the combined cap', () => {
    const heavy = rows.map((r) => ({ ...r, sizeBytes: 30_000_000 }));
    expect(canContinue({ step: 'pick', selectedIds: ids }, merge, heavy)).toBe(false);
  });
  it('rejects a selected id with no row', () => {
    expect(canContinue({ step: 'pick', selectedIds: [ids[0]!, A] }, merge, rows)).toBe(false);
  });
});

describe('pruneFlow', () => {
  const a = makeRow({ name: 'a.pdf' });
  const b = makeRow({ name: 'b.pdf' });
  it('drops ids with no row and keeps the order', () => {
    expect(pruneFlow({ step: 'pick', selectedIds: [b.id, 'gone', a.id] }, [a, b])).toEqual({
      step: 'pick',
      selectedIds: [b.id, a.id],
    });
  });
  it('falls back to pick when nothing selected is left', () => {
    expect(pruneFlow({ step: 'options', selectedIds: ['gone'] }, [a])).toEqual({
      step: 'pick',
      selectedIds: [],
    });
  });
  it('returns the same state when nothing changed', () => {
    const state = { step: 'options' as const, selectedIds: [a.id] };
    expect(pruneFlow(state, [a, b])).toBe(state);
  });
});
