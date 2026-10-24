import Constants from 'expo-constants';

import { TEST_IDS } from '@/config/adsIds';

export type AdsConfig = {
  /** The ADS_ENABLED build flag (app.config.ts). False: no UMP, SDK start, banner or interstitial. */
  enabled: boolean;
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
      enabled: false,
      banner: TEST_IDS.banner,
      interstitial: TEST_IDS.interstitial,
      debugGeography: 'disabled',
      testDeviceIds: [],
    }
  );
}

export { adsEnabled } from '@/config/adsFlag';
