import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';

import { ImageGrid } from '@/components/tools/ImageGrid';
import { initI18n } from '@/i18n';
import { pdfNative } from '@/services/native/pdfNative';
import type { ImageItem } from '@/services/tools/imageSession';
import { fakeSortables } from '@/test-utils/fakeSortables';

const i18n = initI18n('en');
const render = (ui: ReactElement) => rtlRender(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

const mk = (n: number): ImageItem => ({
  key: `i${n}`,
  index: n,
  width: 400,
  height: 300,
  sizeBytes: 10,
});
const [i0, i1, i2] = [mk(0), mk(1), mk(2)];
const onReorder = jest.fn();
const onRemove = jest.fn();

const grid = (kind: 'image' | 'page' = 'image', filter: 'colour' | 'bw' = 'colour') => (
  <ImageGrid
    sessionId="img-s"
    items={[i0, i1, i2]}
    filter={filter}
    kind={kind}
    onReorder={onReorder}
    onRemove={onRemove}
  />
);

describe('ImageGrid', () => {
  let thumb: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    fakeSortables.reset();
    thumb = jest.spyOn(pdfNative, 'renderImageThumbnail').mockResolvedValue('file:///t.jpg');
  });

  it('labels each image with its position', async () => {
    await render(grid());
    expect(screen.getByLabelText('Image 1 of 3')).toBeOnTheScreen();
    expect(screen.getByLabelText('Image 3 of 3')).toBeOnTheScreen();
  });

  it('labels pages when kind is page', async () => {
    await render(grid('page'));
    expect(screen.getByLabelText('Page 1 of 3')).toBeOnTheScreen();
  });

  it('reports the dragged order by key', async () => {
    await render(grid());
    fakeSortables.lastProps().onDragEnd({ data: [i2, i0, i1] });
    expect(onReorder).toHaveBeenCalledWith(['i2', 'i0', 'i1']);
  });

  it('moves the selected image earlier', async () => {
    await render(grid());
    await fireEvent.press(screen.getByLabelText('Image 2 of 3'));
    await fireEvent.press(screen.getByLabelText('Move image 2 earlier'));
    expect(onReorder).toHaveBeenCalledWith(['i1', 'i0', 'i2']);
  });

  it('moves the selected image later', async () => {
    await render(grid());
    await fireEvent.press(screen.getByLabelText('Image 1 of 3'));
    await fireEvent.press(screen.getByLabelText('Move image 1 later'));
    expect(onReorder).toHaveBeenCalledWith(['i1', 'i0', 'i2']);
  });

  it('removes the selected image', async () => {
    await render(grid());
    await fireEvent.press(screen.getByLabelText('Image 2 of 3'));
    await fireEvent.press(screen.getByLabelText('Remove image 2'));
    expect(onRemove).toHaveBeenCalledWith('i1');
  });

  it('disables the actions until something is selected', async () => {
    await render(grid());
    await fireEvent.press(screen.getByLabelText('Move image  earlier'));
    await fireEvent.press(screen.getByLabelText('Remove image '));
    expect(onReorder).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Remove image ')).toBeDisabled();
  });

  it('requests thumbnails and re-requests them when the filter changes', async () => {
    const view = await render(grid());
    expect(thumb).toHaveBeenCalledWith('img-s', 0, expect.any(Number), 'colour');
    const width = thumb.mock.calls[0]?.[2] as number;
    expect(width).toBeLessThanOrEqual(320);
    await act(async () => {
      view.rerender(<I18nextProvider i18n={i18n}>{grid('image', 'bw')}</I18nextProvider>);
    });
    expect(thumb).toHaveBeenCalledWith('img-s', 0, expect.any(Number), 'bw');
  });
});
