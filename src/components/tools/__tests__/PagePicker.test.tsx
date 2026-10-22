import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { useState, type ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';

import { PagePicker } from '@/components/tools/PagePicker';
import { initI18n } from '@/i18n';
import { createToolThumbLoader } from '@/services/tools/toolThumbs';
import { pdfNative } from '@/services/native/pdfNative';

jest.mock('@/services/tools/toolThumbs', () => {
  const actual = jest.requireActual('@/services/tools/toolThumbs');
  return { ...actual, createToolThumbLoader: jest.fn(actual.createToolThumbLoader) };
});

const i18n = initI18n('en');
// FlashList settles its layout (and thumbnails resolve) after the first commit.
async function render(ui: ReactElement) {
  await rtlRender(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
  await act(async () => {});
}

const onChange = jest.fn();
const URI = 'file:///cache/tools/in.pdf';

function picker(selected: readonly number[] = [], fileUri: string | null = URI) {
  return <PagePicker pageCount={10} fileUri={fileUri} selected={selected} onChange={onChange} />;
}

describe('PagePicker', () => {
  let toolThumb: jest.SpyInstance;
  let readerThumb: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    toolThumb = jest.spyOn(pdfNative, 'renderToolThumbnail').mockResolvedValue('file:///t.jpg');
    readerThumb = jest.spyOn(pdfNative, 'renderReaderThumbnail').mockResolvedValue('file:///r.jpg');
  });
  afterEach(() => jest.restoreAllMocks());

  it('shows the selection as ranges and parses typed ranges', async () => {
    await render(picker([1, 2, 3, 5]));
    const input = screen.getByLabelText('Pages');
    expect(input.props.value).toBe('1-3, 5');
    await fireEvent.changeText(input, '1-3, 5');
    expect(onChange).toHaveBeenLastCalledWith([1, 2, 3, 5]);
  });

  it('reports an out-of-range entry without calling onChange', async () => {
    await render(picker());
    await fireEvent.changeText(screen.getByLabelText('Pages'), '0');
    expect(screen.getByText('Pages must be from 1 to 10')).toBeOnTheScreen();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports a syntax error', async () => {
    await render(picker());
    await fireEvent.changeText(screen.getByLabelText('Pages'), 'abc');
    expect(screen.getByText('Use page numbers, ranges like 1-3, and commas')).toBeOnTheScreen();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('toggles a page tile', async () => {
    await render(picker([1]));
    const tile = screen.getByRole('checkbox', { name: 'Page 7' });
    expect(tile.props.accessibilityState).toEqual({ checked: false });
    expect(screen.getByRole('checkbox', { name: 'Page 1' }).props.accessibilityState).toEqual({
      checked: true,
    });
    await fireEvent.press(tile);
    expect(onChange).toHaveBeenCalledWith([1, 7]);
  });

  it('deselects a selected page', async () => {
    await render(picker([1, 7]));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Page 7' }));
    expect(onChange).toHaveBeenCalledWith([1]);
  });

  it('selects all and clears', async () => {
    await render(picker([2]));
    await fireEvent.press(screen.getByRole('button', { name: 'Select all' }));
    expect(onChange).toHaveBeenLastCalledWith([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await fireEvent.press(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('announces the selected count', async () => {
    await render(picker([4]));
    expect(screen.getByText('1 page selected')).toBeOnTheScreen();
    await screen.rerender(picker([4, 5]));
    expect(screen.getByText('2 pages selected')).toBeOnTheScreen();
  });

  it('requests thumbnails on the tool lane for the given file', async () => {
    await render(picker());
    const calls = toolThumb.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [uri, , width] of calls) {
      expect(uri).toBe(URI);
      expect(width).toBeLessThanOrEqual(240);
    }
    expect(readerThumb).not.toHaveBeenCalled();
  });

  it('shows numbered placeholders and requests nothing without a file', async () => {
    await render(picker([], null));
    expect(screen.getByRole('checkbox', { name: 'Page 3' })).toBeOnTheScreen();
    expect(toolThumb).not.toHaveBeenCalled();
  });

  it('rewrites the range text on tile taps and clears a previous error', async () => {
    function Harness() {
      const [selected, setSelected] = useState<number[]>([1]);
      return <PagePicker pageCount={10} fileUri={URI} selected={selected} onChange={setSelected} />;
    }
    await render(<Harness />);
    const input = screen.getByLabelText('Pages');
    await fireEvent.changeText(input, '99');
    expect(screen.getByText('Pages must be from 1 to 10')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Page 7' }));
    expect(screen.getByLabelText('Pages').props.value).toBe('1, 7');
    expect(screen.queryByText('Pages must be from 1 to 10')).toBeNull();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Page 2' }));
    expect(screen.getByLabelText('Pages').props.value).toBe('1-2, 7');
  });

  it('cancels pending thumbnail requests on unmount', async () => {
    await render(picker());
    const loader = jest.mocked(createToolThumbLoader).mock.results.at(-1)!.value;
    const cancel = jest.spyOn(loader, 'cancelPending');
    await screen.unmount();
    expect(cancel).toHaveBeenCalled();
  });
});
