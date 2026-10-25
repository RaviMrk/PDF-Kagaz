import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';

import { PickFilesList } from '@/components/tools/PickFilesList';
import { initI18n } from '@/i18n';
import { JS_MAX_FILE_BYTES, NATIVE_CAPS } from '@/services/tools/limits';
import { formatBytes } from '@/utils/fileSize';
import { makeRow } from '@/test-utils/fileRows';

const mockScrollToIndex = jest.fn(async () => {});
const mockScrollToEnd = jest.fn();
// The real FlashList, with its ref's scrollToIndex recorded (Jest has no native scrolling).
jest.mock('@shopify/flash-list', () => {
  const actual = jest.requireActual<typeof import('@shopify/flash-list')>('@shopify/flash-list');
  const { forwardRef, createElement, useImperativeHandle } =
    jest.requireActual<typeof import('react')>('react');
  return {
    ...actual,
    FlashList: forwardRef((props: object, ref) => {
      useImperativeHandle(ref, () => ({
        scrollToIndex: mockScrollToIndex,
        scrollToEnd: mockScrollToEnd,
      }));
      return createElement(actual.FlashList, props as never);
    }),
  };
});

const i18n = initI18n('en');
// FlashList settles its layout (and thumbnails resolve) after the first commit.
async function render(ui: ReactElement) {
  await rtlRender(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
  await act(async () => {});
}

const intent = makeRow({ name: 'shared.pdf', folder: '' });
const big = makeRow({ name: 'huge.pdf', sizeBytes: 40 * 1024 * 1024 });
const small = makeRow({ name: 'small.pdf', sizeBytes: 2048 });
const other = makeRow({ name: 'other.pdf' });

const onToggle = jest.fn();

function list(
  files = [intent, big, small, other],
  selectedIds: string[] = [],
  max = 5,
  maxFileBytes = JS_MAX_FILE_BYTES,
  reveal: { id: string } | null = null,
) {
  return (
    <PickFilesList
      files={files}
      selectedIds={selectedIds}
      max={max}
      maxFileBytes={maxFileBytes}
      onToggle={onToggle}
      reveal={reveal}
    />
  );
}

describe('PickFilesList', () => {
  beforeEach(() => jest.clearAllMocks());

  it('labels rows opened from another app', async () => {
    await render(list());
    expect(screen.getByText('Opened from another app')).toBeOnTheScreen();
    expect(screen.getAllByText('2.0 KB · Download')).toHaveLength(2);
  });

  it('disables files over the given size cap, naming the limit', async () => {
    expect(big.sizeBytes).toBeGreaterThan(JS_MAX_FILE_BYTES);
    await render(list());
    expect(
      screen.getByText(`Too large for this tool (max ${formatBytes(JS_MAX_FILE_BYTES)})`),
    ).toBeOnTheScreen();
    const row = screen.getByRole('checkbox', { name: 'Select huge.pdf' });
    expect(row.props.accessibilityState).toMatchObject({ disabled: true, checked: false });
    await fireEvent.press(row);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('enables the same file under the native cap', async () => {
    await render(list([big], [], 5, NATIVE_CAPS.file));
    const row = screen.getByRole('checkbox', { name: 'Select huge.pdf' });
    expect(row.props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.queryByText(/Too large for this tool/)).toBeNull();
  });

  it('toggles an enabled row', async () => {
    await render(list());
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Select small.pdf' }));
    expect(onToggle).toHaveBeenCalledWith(small.id);
  });

  it('disables unselected rows once max are selected, keeping selected rows toggleable', async () => {
    await render(list([small, other], [small.id], 1));
    const unselected = screen.getByRole('checkbox', { name: 'Select other.pdf' });
    expect(unselected.props.accessibilityState).toMatchObject({ disabled: true });
    const selected = screen.getByRole('checkbox', { name: 'Select small.pdf' });
    expect(selected.props.accessibilityState).toMatchObject({ checked: true, disabled: false });
    await fireEvent.press(unselected);
    expect(onToggle).not.toHaveBeenCalled();
    await fireEvent.press(selected);
    expect(onToggle).toHaveBeenCalledWith(small.id);
  });

  it('filters by name with the local search', async () => {
    await render(list());
    await fireEvent.changeText(screen.getByLabelText('Search PDFs'), 'SMALL');
    expect(screen.getByText('small.pdf')).toBeOnTheScreen();
    expect(screen.queryByText('other.pdf')).toBeNull();
  });

  it('shows the empty message when nothing is listed', async () => {
    await render(list([]));
    expect(
      screen.getByText('No PDFs to choose from. Use Browse files to pick one.'),
    ).toBeOnTheScreen();
  });

  it('lets an already selected oversized row be deselected', async () => {
    await render(list([big, small], [big.id]));
    const row = screen.getByRole('checkbox', { name: 'Select huge.pdf' });
    expect(row.props.accessibilityState).toMatchObject({ checked: true, disabled: false });
    await fireEvent.press(row);
    expect(onToggle).toHaveBeenCalledWith(big.id);
  });

  it('says nothing matches when the search filters everything out', async () => {
    await render(list());
    await fireEvent.changeText(screen.getByLabelText('Search PDFs'), 'zzz');
    expect(screen.getByText('No PDFs match your search')).toBeOnTheScreen();
    expect(screen.queryByText('No PDFs to choose from. Use Browse files to pick one.')).toBeNull();
  });

  describe('a file to reveal (picked with Browse files)', () => {
    const many = Array.from({ length: 30 }, (_, i) => makeRow({ name: `f${i}.pdf` }));
    const picked = many[25]!;

    it('scrolls it into view', async () => {
      await render(list(many, [picked.id], 5, JS_MAX_FILE_BYTES, { id: picked.id }));
      expect(mockScrollToIndex).toHaveBeenCalledWith({
        index: 25,
        animated: true,
        viewPosition: 0.5,
      });
    });

    it('scrolls again for a new reveal of the same file, not on other updates', async () => {
      const first = { id: picked.id };
      await render(list(many, [picked.id], 5, JS_MAX_FILE_BYTES, first));
      expect(mockScrollToIndex).toHaveBeenCalledTimes(1);
      await screen.rerender(
        <I18nextProvider i18n={i18n}>
          {list([...many], [picked.id], 5, JS_MAX_FILE_BYTES, first)}
        </I18nextProvider>,
      );
      await act(async () => {});
      expect(mockScrollToIndex).toHaveBeenCalledTimes(1);
      await screen.rerender(
        <I18nextProvider i18n={i18n}>
          {list(many, [picked.id], 5, JS_MAX_FILE_BYTES, { id: picked.id })}
        </I18nextProvider>,
      );
      await act(async () => {});
      expect(mockScrollToIndex).toHaveBeenCalledTimes(2);
    });

    it('scrolls to the end for the last row (a picked file just added there)', async () => {
      const last = many[29]!;
      await render(list(many, [last.id], 5, JS_MAX_FILE_BYTES, { id: last.id }));
      expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: true });
      expect(mockScrollToIndex).not.toHaveBeenCalled();
    });

    it('clears a search that hides it, then scrolls to it', async () => {
      await render(list(many));
      await fireEvent.changeText(screen.getByLabelText('Search PDFs'), 'f1');
      await screen.rerender(
        <I18nextProvider i18n={i18n}>
          {list(many, [picked.id], 5, JS_MAX_FILE_BYTES, { id: picked.id })}
        </I18nextProvider>,
      );
      await act(async () => {});
      expect(screen.getByLabelText('Search PDFs').props.value).toBe('');
      expect(mockScrollToIndex).toHaveBeenLastCalledWith({
        index: 25,
        animated: true,
        viewPosition: 0.5,
      });
    });
  });
});
