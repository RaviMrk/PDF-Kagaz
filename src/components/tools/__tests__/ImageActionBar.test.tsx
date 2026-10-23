import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';

import { ImageActionBar } from '@/components/tools/ImageActionBar';
import { initI18n } from '@/i18n';

const i18n = initI18n('en');
const render = (ui: ReactElement) => rtlRender(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
const fns = { onEarlier: jest.fn(), onLater: jest.fn(), onRemove: jest.fn() };
const bar = (kind: 'image' | 'page', selected: number | null, total = 3) => (
  <ImageActionBar kind={kind} selected={selected} total={total} {...fns} />
);

describe('ImageActionBar', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is disabled with neutral labels when nothing is selected', async () => {
    await render(bar('image', null));
    for (const l of [
      'Move selected image earlier',
      'Move selected image later',
      'Remove selected image',
    ]) {
      expect(screen.getByLabelText(l)).toBeDisabled();
    }
  });

  it('uses page wording for pages', async () => {
    await render(bar('page', null));
    expect(screen.getByLabelText('Move selected page earlier')).toBeDisabled();
    expect(screen.getByLabelText('Remove selected page')).toBeDisabled();
  });

  it('disables earlier at the first and later at the last position', async () => {
    const view = await render(bar('image', 1));
    expect(screen.getByLabelText('Move image 1 earlier')).toBeDisabled();
    expect(screen.getByLabelText('Move image 1 later')).toBeEnabled();
    await view.rerender(<I18nextProvider i18n={i18n}>{bar('image', 3)}</I18nextProvider>);
    expect(screen.getByLabelText('Move image 3 later')).toBeDisabled();
  });

  it('fires the callbacks', async () => {
    await render(bar('image', 2));
    await fireEvent.press(screen.getByLabelText('Move image 2 earlier'));
    await fireEvent.press(screen.getByLabelText('Move image 2 later'));
    await fireEvent.press(screen.getByLabelText('Remove image 2'));
    expect(fns.onEarlier).toHaveBeenCalled();
    expect(fns.onLater).toHaveBeenCalled();
    expect(fns.onRemove).toHaveBeenCalled();
  });
});
