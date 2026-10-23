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

/** @param {string | undefined} id */
const isRealId = (id) =>
  typeof id === 'string' && id !== '' && !id.startsWith(GOOGLE_TEST_PUBLISHER);

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
  const appId = env.ADMOB_ANDROID_APP_ID;
  const banner = env.ADMOB_BANNER_ID;
  const interstitial = env.ADMOB_INTERSTITIAL_ID;
  if (!isRealId(appId) || !isRealId(banner) || !isRealId(interstitial)) {
    throw new Error(PRODUCTION_ERROR);
  }
  return {
    appId: /** @type {string} */ (appId),
    banner: /** @type {string} */ (banner),
    interstitial: /** @type {string} */ (interstitial),
    debugGeography: 'disabled',
    testDeviceIds: [],
  };
}

module.exports = { TEST_IDS, resolveAdsConfig };
