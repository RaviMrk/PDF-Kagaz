import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';

import { ImageFilterControl } from '@/components/tools/ImageFilterControl';
import { initI18n } from '@/i18n';

const i18n = initI18n('en');
const render = (ui: ReactElement) => rtlRender(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

describe('ImageFilterControl', () => {
  it('reports the chosen filter', async () => {
    const onChange = jest.fn();
    await render(<ImageFilterControl value="colour" onChange={onChange} />);
    expect(screen.getByLabelText('Filter').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByRole('radio', { name: 'Colour' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Black & white' }));
    expect(onChange).toHaveBeenCalledWith('bw');
    await fireEvent.press(screen.getByRole('radio', { name: 'Greyscale' }));
    expect(onChange).toHaveBeenCalledWith('greyscale');
  });
});
