import { act, render } from '@testing-library/react-native';

import { AdsLifecycle } from '@/components/AdsLifecycle';
import { useSettings } from '@/stores/settingsStore';

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
});
