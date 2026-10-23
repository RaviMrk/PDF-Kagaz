import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';

import { ImageLayoutOptions } from '@/components/tools/ImageLayoutOptions';
import { initI18n } from '@/i18n';
import type { ImageLayoutOptions as Layout } from '@/services/pdf/imageLayout';

const i18n = initI18n('en');
const render = (ui: ReactElement) => rtlRender(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

const value: Layout = { pageSize: 'a4', orientation: 'auto', margin: 'small' };
const onChange = jest.fn();
const onNameChange = jest.fn();

const options = (v: Layout = value) => (
  <ImageLayoutOptions
    value={v}
    onChange={onChange}
    name=""
    namePlaceholder="Images 2026-10-23 14.05"
    onNameChange={onNameChange}
  />
);

describe('ImageLayoutOptions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('changes the page size', async () => {
    await render(options());
    await fireEvent.press(screen.getByLabelText('Letter'));
    expect(onChange).toHaveBeenCalledWith({ ...value, pageSize: 'letter' });
  });

  it('changes the margins', async () => {
    await render(options());
    await fireEvent.press(screen.getByLabelText('Large'));
    expect(onChange).toHaveBeenCalledWith({ ...value, margin: 'large' });
  });

  it('disables orientation for fit and explains why', async () => {
    await render(options({ ...value, pageSize: 'fit' }));
    await fireEvent.press(screen.getByLabelText('Landscape'));
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByText('Fit to image gives each page the shape of its image'),
    ).toBeOnTheScreen();
  });

  it('allows orientation otherwise, without the hint', async () => {
    await render(options());
    await fireEvent.press(screen.getByLabelText('Landscape'));
    expect(onChange).toHaveBeenCalledWith({ ...value, orientation: 'landscape' });
    expect(screen.queryByText(/shape of its image/)).toBeNull();
  });

  it('reports the typed name and shows the default as placeholder', async () => {
    await render(options());
    const input = screen.getByPlaceholderText('Images 2026-10-23 14.05');
    expect(input.props.maxLength).toBe(120);
    await fireEvent.changeText(input, 'Receipt');
    expect(onNameChange).toHaveBeenCalledWith('Receipt');
  });
});
