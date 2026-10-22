import { move } from '@/services/tools/reorder';

describe('move', () => {
  it('moves an item to a new index', () => {
    expect(move(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(move(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
  });

  it('returns an unchanged copy when an index is out of range', () => {
    const list = ['a', 'b', 'c'];
    const out = move(list, 5, 0);
    expect(out).toEqual(list);
    expect(out).not.toBe(list);
    expect(move(list, 0, -1)).toEqual(list);
    expect(move(list, 0, 3)).toEqual(list);
  });
});
