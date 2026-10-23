import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import SettingsScreen from '../../../app/(tabs)/settings';
import { initI18n } from '@/i18n';
import { useAds } from '@/services/ads/adsStore';
import { useSettings } from '@/stores/settingsStore';
import { useToolJobs } from '@/stores/toolJobStore';
import { formatBytes } from '@/utils/fileSize';

const mockClearCaches = jest.fn();
jest.mock('@/services/native/pdfNative', () => ({
  pdfNative: { clearCaches: () => mockClearCaches() },
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));

const openPrivacyOptions = jest.fn();
const i18n = initI18n('en');

const renderSettings = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <SettingsScreen />
    </I18nextProvider>,
  );

describe('Settings sections', () => {
  beforeEach(() => {
    mockClearCaches.mockReset().mockResolvedValue(0);
    openPrivacyOptions.mockReset().mockResolvedValue(true);
    useSettings.setState({
      language: null,
      imageQuality: 'standard',
      analyticsEnabled: true,
      crashReportsEnabled: true,
    });
    useAds.setState({ privacyOptionsRequired: false, openPrivacyOptions });
    useToolJobs.setState({ active: null });
  });

  it('shows the saved-files location', async () => {
    await renderSettings();
    expect(screen.getByText('New PDFs are saved to Documents/PDFToolkit')).toBeTruthy();
  });

  it('chooses the image quality', async () => {
    await renderSettings();
    await fireEvent.press(screen.getByLabelText('Sharper'));
    expect(useSettings.getState().imageQuality).toBe('high');
    expect(screen.getByLabelText('Sharper').props.accessibilityState.checked).toBe(true);
  });

  it('chooses the language and lists the coming-soon note', async () => {
    await renderSettings();
    expect(screen.getByText('Marathi and Hindi are coming in a later update.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('English'));
    expect(useSettings.getState().language).toBe('en');
    await fireEvent.press(screen.getByLabelText('Phone language'));
    expect(useSettings.getState().language).toBeNull();
  });

  it('toggles the telemetry opt-outs as switches', async () => {
    await renderSettings();
    const analytics = screen.getByLabelText('Share anonymous usage statistics');
    expect(analytics.props.accessibilityRole).toBe('switch');
    expect(analytics.props.accessibilityState.checked).toBe(true);
    await fireEvent.press(analytics);
    expect(useSettings.getState().analyticsEnabled).toBe(false);
    await fireEvent.press(screen.getByLabelText('Send crash reports'));
    expect(useSettings.getState().crashReportsEnabled).toBe(false);
  });

  it('hides ad privacy choices unless required', async () => {
    await renderSettings();
    expect(screen.queryByLabelText('Ad privacy choices')).toBeNull();
  });

  it('opens ad privacy choices and reports a failure', async () => {
    useAds.setState({ privacyOptionsRequired: true });
    await renderSettings();
    await fireEvent.press(screen.getByLabelText('Ad privacy choices'));
    expect(openPrivacyOptions).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Couldn't open ad privacy/)).toBeNull();
    openPrivacyOptions.mockResolvedValue(false);
    await fireEvent.press(screen.getByLabelText('Ad privacy choices'));
    expect(
      await screen.findByText(
        "Couldn't open ad privacy choices. Check your connection and try again.",
      ),
    ).toBeTruthy();
  });

  it('clears the cache and announces the freed size', async () => {
    mockClearCaches.mockResolvedValue(2_621_440);
    await renderSettings();
    await fireEvent.press(screen.getByLabelText('Clear cache'));
    const done = await screen.findByText(`Freed ${formatBytes(2_621_440)}`);
    expect(done.props.accessibilityLiveRegion).toBe('polite');
  });

  it('reports a cache failure', async () => {
    mockClearCaches.mockRejectedValue(new Error('x'));
    await renderSettings();
    await fireEvent.press(screen.getByLabelText('Clear cache'));
    expect(await screen.findByText("Couldn't clear the cache")).toBeTruthy();
  });

  it('disables Clear cache while a tool runs', async () => {
    await renderSettings();
    await act(async () => {
      useToolJobs.setState({
        active: { jobId: 'j', toolId: 'merge', phase: 'running', fraction: 0 },
      } as never);
    });
    expect(screen.getByText('Wait for the running tool to finish')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Clear cache'));
    expect(mockClearCaches).not.toHaveBeenCalled();
  });
});
