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
 * @param {Record<string, string | undefined>} env
 * @returns {{ appId: string; banner: string; interstitial: string; debugGeography: 'EEA' | 'disabled'; testDeviceIds: string[] }}
 */
function resolveAdsConfig(env) {
  if (env.APP_ENV !== 'production') {
    return {
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
  return { appId, banner, interstitial, debugGeography: 'disabled', testDeviceIds: [] };
}

module.exports = { TEST_IDS, resolveAdsConfig };
