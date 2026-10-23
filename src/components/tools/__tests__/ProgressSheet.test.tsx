import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';

import { ProgressSheet } from '@/components/tools/ProgressSheet';
import { initI18n } from '@/i18n';
import type { ToolPhase } from '@/services/tools/runTool';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  // A 3-button navigation bar under an edge-to-edge window.
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 48, left: 0 }),
}));

const i18n = initI18n('en');
const render = (ui: ReactElement) => rtlRender(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

const onCancel = jest.fn();
const onHide = jest.fn();

function sheet(phase: ToolPhase, fraction: number, visible = true) {
  return (
    <ProgressSheet
      visible={visible}
      title="Merging"
      phase={phase}
      fraction={fraction}
      onCancel={onCancel}
      onHide={onHide}
    />
  );
}

describe('ProgressSheet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the percent and exposes it as a progress bar value', async () => {
    await render(sheet('processing', 0.42));
    expect(screen.getByText('Merging')).toBeOnTheScreen();
    expect(screen.getByText('42%')).toBeOnTheScreen();
    expect(screen.getByText('Working…')).toBeOnTheScreen();
    const bar = screen.getByRole('progressbar');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 42 });
  });

  it('names the phase', async () => {
    await render(sheet('saving', 0.9));
    expect(screen.getByText('Saving…')).toBeOnTheScreen();
    await screen.rerender(sheet('preparing', 0));
    expect(screen.getByText('Reading files…')).toBeOnTheScreen();
  });

  it('cancels and hides', async () => {
    await render(sheet('processing', 0.1));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue in background' }));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('treats the Android back button as hide', async () => {
    await render(sheet('processing', 0.1));
    await fireEvent(screen.getByTestId('progress-modal'), 'requestClose');
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
  it('keeps its buttons above the navigation bar', async () => {
    await render(sheet('processing', 0.5));
    const panel = StyleSheet.flatten(screen.getByTestId('bottom-sheet-panel').props.style);
    expect(panel.paddingBottom).toBe(20 + 48);
  });
});
