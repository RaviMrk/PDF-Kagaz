import { InterstitialAd } from 'react-native-google-mobile-ads';

import { adsEnabled } from '@/config/adsFlag';
import { useAds } from '../adsStore';
import { interstitial } from '../interstitial';

jest.mock('react-native-google-mobile-ads', () => ({
  AdEventType: { ERROR: 'error', CLOSED: 'closed', LOADED: 'loaded' },
  InterstitialAd: { createForAdRequest: jest.fn() },
}));

describe('interstitial with the ADS_ENABLED flag off', () => {
  afterEach(() => {
    (adsEnabled as jest.Mock).mockReturnValue(true);
    useAds.setState({ status: 'idle', canRequestAds: false });
  });

  it('creates, preloads and shows nothing even when consent says ads are allowed', () => {
    (adsEnabled as jest.Mock).mockReturnValue(false);
    useAds.setState({ status: 'ready', canRequestAds: true });
    interstitial.preload();
    expect(InterstitialAd.createForAdRequest).not.toHaveBeenCalled();
    expect(interstitial.showAfterDone()).toBe(false);
  });
});
