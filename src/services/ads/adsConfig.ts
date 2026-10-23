import Constants from 'expo-constants';

import { TEST_IDS } from '@/config/adsIds';

export type AdsConfig = {
  banner: string;
  interstitial: string;
  debugGeography: 'EEA' | 'disabled';
  testDeviceIds: string[];
};

/** The ad unit IDs and consent debug settings app.config.ts resolved for this build. */
export function getAdsConfig(): AdsConfig {
  const ads = Constants.expoConfig?.extra?.ads as AdsConfig | undefined;
  return (
    ads ?? {
      banner: TEST_IDS.banner,
      interstitial: TEST_IDS.interstitial,
      debugGeography: 'disabled',
      testDeviceIds: [],
    }
  );
}
