// Shared by app.config.ts (Node) and the app: AdMob IDs per build. Google's test IDs are used
// unless APP_ENV=production, and a production build without real IDs fails at config time.

const GOOGLE_TEST_PUBLISHER = 'ca-app-pub-3940256099942544';

const TEST_IDS = {
  appId: 'ca-app-pub-3940256099942544~3347511713',
  banner: 'ca-app-pub-3940256099942544/9214589741',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
};

const PRODUCTION_ERROR =
  'Production build needs real AdMob IDs: set ADMOB_ANDROID_APP_ID, ADMOB_BANNER_ID, ADMOB_INTERSTITIAL_ID';

const APP_ID_PATTERN = /^ca-app-pub-\d+~\d+$/;
const UNIT_ID_PATTERN = /^ca-app-pub-\d+\/\d+$/;

/**
 * The trimmed ID when it has the AdMob shape for its kind and is not under Google's test
 * publisher; otherwise null.
 * @param {string | undefined} raw
 * @param {RegExp} pattern
 * @returns {string | null}
 */
const realId = (raw, pattern) => {
  const id = typeof raw === 'string' ? raw.trim() : '';
  return pattern.test(id) && id.split(/[~/]/)[0] !== GOOGLE_TEST_PUBLISHER ? id : null;
};

/**
 * The ads build flag: off unless ADS_ENABLED is exactly "true".
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
const adsEnabled = (env) => env.ADS_ENABLED === 'true';

/**
 * With ads off, the SDK is still linked and needs an app ID in the manifest, so Google's test IDs
 * are used and no real IDs are required, even in production.
 * @param {Record<string, string | undefined>} env
 * @returns {{ enabled: boolean; appId: string; banner: string; interstitial: string; debugGeography: 'EEA' | 'disabled'; testDeviceIds: string[] }}
 */
function resolveAdsConfig(env) {
  const enabled = adsEnabled(env);
  if (!enabled) {
    return { enabled, ...TEST_IDS, debugGeography: 'disabled', testDeviceIds: [] };
  }
  if (env.APP_ENV !== 'production') {
    return {
      enabled,
      ...TEST_IDS,
      debugGeography: env.ADS_DEBUG_GEOGRAPHY === 'EEA' ? 'EEA' : 'disabled',
      testDeviceIds: (env.ADS_TEST_DEVICE_IDS ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id !== ''),
    };
  }
  const appId = realId(env.ADMOB_ANDROID_APP_ID, APP_ID_PATTERN);
  const banner = realId(env.ADMOB_BANNER_ID, UNIT_ID_PATTERN);
  const interstitial = realId(env.ADMOB_INTERSTITIAL_ID, UNIT_ID_PATTERN);
  if (appId === null || banner === null || interstitial === null) {
    throw new Error(PRODUCTION_ERROR);
  }
  return { enabled, appId, banner, interstitial, debugGeography: 'disabled', testDeviceIds: [] };
}

module.exports = { TEST_IDS, adsEnabled, resolveAdsConfig };
