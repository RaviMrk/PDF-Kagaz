import { render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { ReaderBottomBar } from '@/components/reader/ReaderBottomBar';
import { initI18n } from '@/i18n';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  // A 3-button navigation bar under an edge-to-edge window.
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 48, left: 0 }),
}));

const i18n = initI18n('en');
const render = (ui: ReactElement) => rtlRender(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

describe('ReaderBottomBar', () => {
  it('is 56 dp tall above the navigation bar, the room the reader leaves for it', async () => {
    await render(<ReaderBottomBar page={3} pageCount={3} onPressPage={() => {}} />);
    const style = StyleSheet.flatten(screen.getByTestId('reader-bottom-bar').props.style);
    // Yoga's minHeight includes padding: without the inset in it, the bar would be 48 + inset.
    expect(style).toMatchObject({ minHeight: 56 + 48, paddingBottom: 48 });
  });
});
