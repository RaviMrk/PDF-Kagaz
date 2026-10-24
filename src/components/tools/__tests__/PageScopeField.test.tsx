import { fireEvent, render, screen } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import { initI18n } from '@/i18n';

import { PageScopeField } from '../PageScopeField';

const i18n = initI18n('en');

async function setup(value: number[] | null = null) {
  const onChange = jest.fn();
  await render(
    <I18nextProvider i18n={i18n}>
      <PageScopeField pageCount={5} value={value} onChange={onChange} />
    </I18nextProvider>,
  );
  return { onChange };
}

describe('PageScopeField', () => {
  it('starts at All pages', async () => {
    await setup();
    expect(screen.getByLabelText('All pages')).toBeChecked();
    expect(screen.queryByPlaceholderText('e.g. 1-3, 5')).toBeNull();
  });

  it('reports the typed pages under Some pages', async () => {
    const { onChange } = await setup();
    await fireEvent.press(screen.getByLabelText('Some pages'));
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. 1-3, 5'), '3, 2-3');
    expect(onChange).toHaveBeenLastCalledWith([2, 3]);
  });

  it('shows the out-of-range error and reports no pages for it', async () => {
    const { onChange } = await setup();
    await fireEvent.press(screen.getByLabelText('Some pages'));
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. 1-3, 5'), '2');
    expect(onChange).toHaveBeenLastCalledWith([2]);
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. 1-3, 5'), '9');
    expect(screen.getByText('Pages must be from 1 to 5')).toBeTruthy();
    // No valid selection (the caller cannot run): never a page list with the bad page.
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(onChange).not.toHaveBeenCalledWith(expect.arrayContaining([9]));
  });

  it('shows no error before anything is typed', async () => {
    const { onChange } = await setup();
    await fireEvent.press(screen.getByLabelText('Some pages'));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.queryByText('Enter at least one page')).toBeNull();
  });

  it('reports null for All pages', async () => {
    const { onChange } = await setup([2]);
    await fireEvent.press(screen.getByLabelText('All pages'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
