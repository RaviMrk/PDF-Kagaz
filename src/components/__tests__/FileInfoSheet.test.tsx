import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { I18nextProvider } from 'react-i18next';

import { FileInfoSheet } from '@/components/FileInfoSheet';
import { initI18n } from '@/i18n';
import { makeRow } from '@/test-utils/fileRows';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  // A 3-button navigation bar under an edge-to-edge window.
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 48, left: 0 }),
}));

describe('FileInfoSheet', () => {
  it('keeps its rows above the navigation bar', async () => {
    await render(
      <I18nextProvider i18n={initI18n('en')}>
        <FileInfoSheet file={makeRow({ name: 'Report.pdf' })} onClose={() => {}} />
      </I18nextProvider>,
    );
    expect(screen.getByText('Report.pdf')).toBeOnTheScreen();
    const panel = StyleSheet.flatten(screen.getByTestId('bottom-sheet-panel').props.style);
    expect(panel.paddingBottom).toBe(16 + 48);
  });
});
