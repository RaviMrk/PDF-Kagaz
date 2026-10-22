import {
  initialOrganize,
  isUnchanged,
  organizeReducer,
  toPageEdits,
  type OrganizeState,
} from '@/services/tools/organizeState';

const keys = (s: OrganizeState) => s.pages.map((p) => p.key);
const sources = (s: OrganizeState) => s.pages.map((p) => p.source);

describe('organizeState', () => {
  it('starts with every page in order', () => {
    const s = initialOrganize(3);
    expect(keys(s)).toEqual(['p1', 'p2', 'p3']);
    expect(sources(s)).toEqual([1, 2, 3]);
    expect(s.pages.every((p) => p.rotate === 0)).toBe(true);
    expect(s.nextKey).toBe(4);
  });

  it('rotates by 90 degrees and wraps', () => {
    let s = initialOrganize(3);
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      s = organizeReducer(s, { type: 'rotate', key: 'p2' });
      seen.push(s.pages[1]!.rotate);
    }
    expect(seen).toEqual([90, 180, 270, 0]);
  });

  it('duplicates a page right after itself', () => {
    const s = organizeReducer(initialOrganize(3), { type: 'duplicate', key: 'p1' });
    expect(keys(s)).toEqual(['p1', 'p4', 'p2', 'p3']);
    expect(sources(s)).toEqual([1, 1, 2, 3]);
    expect(s.nextKey).toBe(5);
  });

  it('copies the rotation when duplicating', () => {
    let s = organizeReducer(initialOrganize(2), { type: 'rotate', key: 'p1' });
    s = organizeReducer(s, { type: 'duplicate', key: 'p1' });
    expect(s.pages.map((p) => p.rotate)).toEqual([90, 90, 0]);
  });

  it('deletes pages but never the last one', () => {
    let s = organizeReducer(initialOrganize(3), { type: 'delete', key: 'p2' });
    expect(sources(s)).toEqual([1, 3]);
    s = organizeReducer(s, { type: 'delete', key: 'p1' });
    const last = organizeReducer(s, { type: 'delete', key: 'p3' });
    expect(last).toBe(s);
  });

  it('moves a page by one and ignores the ends', () => {
    const s = initialOrganize(3);
    expect(keys(organizeReducer(s, { type: 'move', key: 'p3', delta: -1 }))).toEqual([
      'p1',
      'p3',
      'p2',
    ]);
    expect(organizeReducer(s, { type: 'move', key: 'p1', delta: -1 })).toBe(s);
    expect(organizeReducer(s, { type: 'move', key: 'p3', delta: 1 })).toBe(s);
  });

  it('applies a dragged order only for the same set of keys', () => {
    const s = initialOrganize(3);
    expect(keys(organizeReducer(s, { type: 'reorder', keys: ['p3', 'p1', 'p2'] }))).toEqual([
      'p3',
      'p1',
      'p2',
    ]);
    expect(organizeReducer(s, { type: 'reorder', keys: ['p1'] })).toBe(s);
    expect(organizeReducer(s, { type: 'reorder', keys: ['p1', 'p2', 'p9'] })).toBe(s);
  });

  it('turns the state into page edits', () => {
    let s = organizeReducer(initialOrganize(3), { type: 'rotate', key: 'p3' });
    s = organizeReducer(s, { type: 'delete', key: 'p2' });
    expect(toPageEdits(s)).toEqual([
      { source: 1, rotate: 0 },
      { source: 3, rotate: 90 },
    ]);
  });

  it('knows when nothing changed', () => {
    const s = initialOrganize(3);
    expect(isUnchanged(s, 3)).toBe(true);
    expect(isUnchanged(organizeReducer(s, { type: 'rotate', key: 'p1' }), 3)).toBe(false);
    expect(isUnchanged(organizeReducer(s, { type: 'delete', key: 'p1' }), 3)).toBe(false);
    expect(isUnchanged(organizeReducer(s, { type: 'duplicate', key: 'p1' }), 3)).toBe(false);
    expect(isUnchanged(organizeReducer(s, { type: 'reorder', keys: ['p2', 'p1', 'p3'] }), 3)).toBe(
      false,
    );
  });
});
