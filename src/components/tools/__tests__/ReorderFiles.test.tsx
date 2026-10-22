import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';

import { ReorderFiles } from '@/components/tools/ReorderFiles';
import { initI18n } from '@/i18n';
import { fakeSortables } from '@/test-utils/fakeSortables';
import { makeRow } from '@/test-utils/fileRows';

const i18n = initI18n('en');
const render = (ui: ReactElement) => rtlRender(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

const a = makeRow({ name: 'a.pdf' });
const b = makeRow({ name: 'b.pdf' });
const c = makeRow({ name: 'c.pdf' });
const onReorder = jest.fn();
const onRemove = jest.fn();

const list = () => <ReorderFiles files={[a, b, c]} onReorder={onReorder} onRemove={onRemove} />;

describe('ReorderFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fakeSortables.reset();
  });

  it('reports the dragged order by id', async () => {
    await render(list());
    fakeSortables.lastProps().onDragEnd({ data: [c, a, b], fromIndex: 2, toIndex: 0 });
    expect(onReorder).toHaveBeenCalledWith(['id-c.pdf', 'id-a.pdf', 'id-b.pdf']);
  });

  it('is a one-column grid keyed by file id', async () => {
    await render(list());
    const props = fakeSortables.lastProps();
    expect(props.columns).toBe(1);
    expect(props.keyExtractor(b)).toBe(b.id);
  });

  it('moves a file down with its button', async () => {
    await render(list());
    await fireEvent.press(screen.getByRole('button', { name: 'Move b.pdf down' }));
    expect(onReorder).toHaveBeenCalledWith(['id-a.pdf', 'id-c.pdf', 'id-b.pdf']);
  });

  it('moves a file up with its button', async () => {
    await render(list());
    await fireEvent.press(screen.getByRole('button', { name: 'Move c.pdf up' }));
    expect(onReorder).toHaveBeenCalledWith(['id-a.pdf', 'id-c.pdf', 'id-b.pdf']);
  });

  it('has no Move up on the first row and no Move down on the last', async () => {
    await render(list());
    expect(screen.queryByRole('button', { name: 'Move a.pdf up' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move c.pdf down' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Move a.pdf down' })).toBeOnTheScreen();
  });

  it('removes a file', async () => {
    await render(list());
    await fireEvent.press(screen.getByRole('button', { name: 'Remove b.pdf' }));
    expect(onRemove).toHaveBeenCalledWith('id-b.pdf');
  });

  it('shows position numbers', async () => {
    await render(list());
    expect(screen.getByText('1')).toBeOnTheScreen();
    expect(screen.getByText('3')).toBeOnTheScreen();
  });
});
