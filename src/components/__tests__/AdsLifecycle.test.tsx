import { act, render } from '@testing-library/react-native';

import { AdsLifecycle } from '@/components/AdsLifecycle';
import { adsEnabled } from '@/config/adsFlag';
import { useToolJobs } from '@/stores/toolJobStore';
import { useSettings } from '@/stores/settingsStore';

const mockPreload = jest.fn();
jest.mock('@/services/ads/interstitial', () => ({
  interstitial: { preload: () => mockPreload() },
}));
const mockStart = jest.fn(() => Promise.resolve());
jest.mock('@/services/ads/adsStore', () => ({
  useAds: { getState: () => ({ start: () => mockStart() }) },
}));

describe('AdsLifecycle', () => {
  it('starts ads only once onboarding is done', async () => {
    useSettings.getState().setOnboardingDone(false);
    await render(<AdsLifecycle />);
    expect(mockStart).not.toHaveBeenCalled();

    await act(async () => useSettings.getState().setOnboardingDone(true));
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('preloads the interstitial when a job starts, not when it ends', async () => {
    await render(<AdsLifecycle />);
    const job = { jobId: 'j', toolId: 'merge', phase: 'preparing', fraction: 0 } as const;
    await act(async () => useToolJobs.setState({ active: job }));
    expect(mockPreload).toHaveBeenCalledTimes(1);
    await act(async () => useToolJobs.setState({ active: { ...job, fraction: 0.5 } }));
    await act(async () => useToolJobs.setState({ active: null }));
    expect(mockPreload).toHaveBeenCalledTimes(1);
  });

  describe('with the ADS_ENABLED flag off', () => {
    beforeEach(() => {
      mockStart.mockClear();
      mockPreload.mockClear();
      (adsEnabled as jest.Mock).mockReturnValue(false);
    });
    afterEach(() => (adsEnabled as jest.Mock).mockReturnValue(true));

    it('never starts consent or the SDK', async () => {
      useSettings.getState().setOnboardingDone(true);
      await render(<AdsLifecycle />);
      expect(mockStart).not.toHaveBeenCalled();
    });

    it('never preloads an interstitial', async () => {
      await render(<AdsLifecycle />);
      const job = { jobId: 'j', toolId: 'merge', phase: 'preparing', fraction: 0 } as const;
      await act(async () => useToolJobs.setState({ active: job }));
      expect(mockPreload).not.toHaveBeenCalled();
    });
  });
});
