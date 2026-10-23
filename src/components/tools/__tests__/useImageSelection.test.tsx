import { act, renderHook } from '@testing-library/react-native';

import { useImageSelection } from '@/components/tools/useImageSelection';
import type { ImageItem } from '@/services/tools/imageSession';

const mk = (n: number): ImageItem => ({
  key: `i${n}`,
  index: n,
  width: 4,
  height: 3,
  sizeBytes: 1,
});
const items = [mk(0), mk(1), mk(2)];

describe('useImageSelection', () => {
  const onReorder = jest.fn();
  const onRemove = jest.fn();
  beforeEach(() => jest.clearAllMocks());
  const setup = (list = items) =>
    renderHook<ReturnType<typeof useImageSelection>, { l: ImageItem[] }>(
      ({ l }) => useImageSelection(l, onReorder, onRemove),
      { initialProps: { l: list } },
    );

  it('toggles a selection with a 1-based position', async () => {
    const { result } = await setup();
    expect(result.current.position).toBeNull();
    await act(async () => result.current.toggle('i1'));
    expect(result.current.selectedKey).toBe('i1');
    expect(result.current.position).toBe(2);
    await act(async () => result.current.toggle('i1'));
    expect(result.current.selectedKey).toBeNull();
  });

  it('moves the selection earlier and later', async () => {
    const { result } = await setup();
    await act(async () => result.current.toggle('i1'));
    await act(async () => result.current.moveEarlier());
    expect(onReorder).toHaveBeenLastCalledWith(['i1', 'i0', 'i2']);
    await act(async () => result.current.moveLater());
    expect(onReorder).toHaveBeenLastCalledWith(['i0', 'i2', 'i1']);
  });

  it('keeps the selection by key after a reorder', async () => {
    const { result, rerender } = await setup();
    await act(async () => result.current.toggle('i1'));
    await act(async () => rerender({ l: [items[1]!, items[0]!, items[2]!] }));
    expect(result.current.position).toBe(1);
  });

  it('removes the selection and clears it', async () => {
    const { result } = await setup();
    await act(async () => result.current.toggle('i2'));
    await act(async () => result.current.remove());
    expect(onRemove).toHaveBeenCalledWith('i2');
    expect(result.current.selectedKey).toBeNull();
  });
});
