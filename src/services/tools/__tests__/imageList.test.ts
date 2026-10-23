import type { ImageItem } from '../imageSession';
import { appendItems, moveKey, nextSourceIndex, removeKey, reorderByKeys } from '../imageList';

const mk = (n: number): ImageItem => ({
  key: `i${n}`,
  index: n,
  width: 4,
  height: 3,
  sizeBytes: 1,
});
const [a, b, c] = [mk(0), mk(1), mk(2)];
const keys = (l: ImageItem[]) => l.map((i) => i.key);

describe('imageList', () => {
  it('appends in order', () => {
    expect(keys(appendItems([a], [b, c]))).toEqual(['i0', 'i1', 'i2']);
  });

  it('reorders by a permutation of the keys', () => {
    expect(keys(reorderByKeys([a, b, c], ['i2', 'i0', 'i1']))).toEqual(['i2', 'i0', 'i1']);
  });

  it('keeps the same array for a different key set', () => {
    const list = [a, b, c];
    expect(reorderByKeys(list, ['i0', 'i1'])).toBe(list);
    expect(reorderByKeys(list, ['i0', 'i1', 'x'])).toBe(list);
    expect(reorderByKeys(list, ['i0', 'i0', 'i1'])).toBe(list);
  });

  it('removes a key', () => {
    expect(keys(removeKey([a, b, c], 'i1'))).toEqual(['i0', 'i2']);
  });

  it('moves a key by one, unchanged at the ends', () => {
    const list = [a, b, c];
    expect(keys(moveKey(list, 'i0', -1))).toEqual(['i0', 'i1', 'i2']);
    expect(keys(moveKey(list, 'i2', 1))).toEqual(['i0', 'i1', 'i2']);
    expect(keys(moveKey(list, 'i0', 1))).toEqual(['i1', 'i0', 'i2']);
    expect(keys(moveKey(list, 'i2', -1))).toEqual(['i0', 'i2', 'i1']);
  });

  it('picks the next free source index after the highest one', () => {
    expect(nextSourceIndex([])).toBe(0);
    expect(nextSourceIndex([a, c])).toBe(3);
  });
});
