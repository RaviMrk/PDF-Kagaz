import { makeRow } from '@/test-utils/fileRows';

import { pruneSelection, selectionActions, toggleId } from '../selection';

const MB = 1024 * 1024;
const a = makeRow({ name: 'a.pdf' });
const b = makeRow({ name: 'b.pdf' });

describe('selection', () => {
  it('toggles an id off when present and appends it when absent', () => {
    expect(toggleId(['a'], 'a')).toEqual([]);
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('offers split and organise for exactly one row', () => {
    expect(selectionActions([a])).toEqual({ merge: false, split: true, organize: true });
  });

  it('offers merge for two rows', () => {
    expect(selectionActions([a, b])).toEqual({ merge: true, split: false, organize: false });
  });

  it('offers nothing for an empty selection', () => {
    expect(selectionActions([])).toEqual({ merge: false, split: false, organize: false });
  });

  it('refuses merge when a row is over 30 MiB', () => {
    const big = makeRow({ name: 'big.pdf', sizeBytes: 40 * MB });
    expect(selectionActions([a, big]).merge).toBe(false);
    expect(selectionActions([big]).split).toBe(false);
  });

  it('refuses merge when the total is over 100 MiB', () => {
    const rows = [1, 2, 3, 4].map((i) => makeRow({ name: `${i}.pdf`, sizeBytes: 28 * MB }));
    expect(selectionActions(rows).merge).toBe(false);
  });

  it('refuses merge for 51 rows and allows 50', () => {
    const rows = Array.from({ length: 51 }, (_, i) => makeRow({ name: `${i}.pdf`, sizeBytes: 1 }));
    expect(selectionActions(rows).merge).toBe(false);
    expect(selectionActions(rows.slice(0, 50)).merge).toBe(true);
  });

  it('treats an unknown size like the flow does (as zero)', () => {
    const odd = makeRow({ name: 'odd.pdf', sizeBytes: null as never });
    expect(selectionActions([a, odd]).merge).toBe(true);
  });

  it('prunes ids that no longer have a row, keeping order', () => {
    expect(pruneSelection(['a', 'x'], [{ ...a, id: 'a' }])).toEqual(['a']);
    const same = ['a'];
    expect(pruneSelection(same, [{ ...a, id: 'a' }])).toBe(same);
  });
});
