import { makeRow } from '@/test-utils/fileRows';

import { deleteFiles, favoriteTarget } from '../bulkActions';

describe('deleteFiles', () => {
  it('removes each id one at a time, in order', async () => {
    const order: string[] = [];
    let running = 0;
    const remove = jest.fn(async (id: string) => {
      running += 1;
      expect(running).toBe(1);
      order.push(id);
      await Promise.resolve();
      running -= 1;
      return null;
    });
    await expect(deleteFiles(['a', 'b', 'c'], remove)).resolves.toEqual({
      deleted: ['a', 'b', 'c'],
      failed: [],
    });
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('keeps going after a failure and reports which ids failed and why', async () => {
    const remove = jest.fn((id: string) =>
      Promise.resolve(id === 'b' ? ('permission' as const) : null),
    );
    await expect(deleteFiles(['a', 'b', 'c'], remove)).resolves.toEqual({
      deleted: ['a', 'c'],
      failed: [{ id: 'b', error: 'permission' }],
    });
    expect(remove).toHaveBeenCalledTimes(3);
  });

  it('counts a thrown remove as unknown', async () => {
    const remove = jest.fn(() => Promise.reject(new Error('boom')));
    await expect(deleteFiles(['a'], remove)).resolves.toEqual({
      deleted: [],
      failed: [{ id: 'a', error: 'unknown' }],
    });
  });
});

describe('favoriteTarget', () => {
  it('adds when any selected row is not a favourite', () => {
    expect(favoriteTarget([makeRow({ name: 'a', isFavorite: true }), makeRow({ name: 'b' })])).toBe(
      true,
    );
    expect(favoriteTarget([makeRow({ name: 'a' })])).toBe(true);
  });

  it('removes when every selected row is a favourite', () => {
    expect(
      favoriteTarget([
        makeRow({ name: 'a', isFavorite: true }),
        makeRow({ name: 'b', isFavorite: true }),
      ]),
    ).toBe(false);
  });
});
