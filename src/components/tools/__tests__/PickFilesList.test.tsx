import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';

import { PickFilesList } from '@/components/tools/PickFilesList';
import { initI18n } from '@/i18n';
import { JS_MAX_FILE_BYTES } from '@/services/tools/limits';
import { makeRow } from '@/test-utils/fileRows';

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

function list(files = [intent, big, small, other], selectedIds: string[] = [], max = 5) {
  return <PickFilesList files={files} selectedIds={selectedIds} max={max} onToggle={onToggle} />;
}

describe('PickFilesList', () => {
  beforeEach(() => jest.clearAllMocks());

  it('labels rows opened from another app', async () => {
    await render(list());
    expect(screen.getByText('Opened from another app')).toBeOnTheScreen();
    expect(screen.getAllByText('2.0 KB · Download')).toHaveLength(2);
  });

  it('disables files over the JS size cap', async () => {
    expect(big.sizeBytes).toBeGreaterThan(JS_MAX_FILE_BYTES);
    await render(list());
    expect(screen.getByText('Too large for this tool (max 30 MB)')).toBeOnTheScreen();
    const row = screen.getByRole('checkbox', { name: 'Select huge.pdf' });
    expect(row.props.accessibilityState).toMatchObject({ disabled: true, checked: false });
    await fireEvent.press(row);
    expect(onToggle).not.toHaveBeenCalled();
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
});
