import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { I18nextProvider } from 'react-i18next';

import { SortMenu } from '@/components/SortMenu';
import { initI18n } from '@/i18n';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  // A 3-button navigation bar under an edge-to-edge window.
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 48, left: 0 }),
}));

describe('SortMenu', () => {
  it('opens a sheet above the navigation bar and reports a choice', async () => {
    const onChange = jest.fn();
    await render(
      <I18nextProvider i18n={initI18n('en')}>
        <SortMenu sortKey="name" sortDir="asc" onChange={onChange} />
      </I18nextProvider>,
    );
    await fireEvent.press(screen.getByLabelText('Sort by'));
    const panel = StyleSheet.flatten(screen.getByTestId('bottom-sheet-panel').props.style);
    expect(panel.paddingBottom).toBe(16 + 48);
    await fireEvent.press(screen.getByRole('radio', { name: 'Size' }));
    expect(onChange).toHaveBeenCalledWith('size', 'asc');
  });
});
