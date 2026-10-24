import Constants from 'expo-constants';

/**
 * The ADS_ENABLED build flag (app.config.ts → extra.ads.enabled). Off unless a build was made with
 * ADS_ENABLED=true. Lives outside services/ads so ad-free screens can read it without touching ads.
 */
export function adsEnabled(): boolean {
  const ads = Constants.expoConfig?.extra?.ads as { enabled?: boolean } | undefined;
  return ads?.enabled === true;
}
