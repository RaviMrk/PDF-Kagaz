import Constants from 'expo-constants';

import { resolveAdsConfig, TEST_IDS } from '@/config/adsIds';

import { getAdsConfig } from '../adsConfig';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: undefined } }));

const mocked = Constants as unknown as { expoConfig: unknown };

const REAL = {
  ADMOB_ANDROID_APP_ID: 'ca-app-pub-1111111111111111~2222222222',
  ADMOB_BANNER_ID: 'ca-app-pub-1111111111111111/3333333333',
  ADMOB_INTERSTITIAL_ID: 'ca-app-pub-1111111111111111/4444444444',
};
const MESSAGE =
  'Production build needs real AdMob IDs: set ADMOB_ANDROID_APP_ID, ADMOB_BANNER_ID, ADMOB_INTERSTITIAL_ID';

describe('resolveAdsConfig', () => {
  it("uses Google's test IDs and no debug geography by default", () => {
    expect(TEST_IDS).toEqual({
      appId: 'ca-app-pub-3940256099942544~3347511713',
      banner: 'ca-app-pub-3940256099942544/9214589741',
      interstitial: 'ca-app-pub-3940256099942544/1033173712',
    });
    expect(resolveAdsConfig({})).toEqual({
      ...TEST_IDS,
      debugGeography: 'disabled',
      testDeviceIds: [],
    });
  });

  it('honours the debug consent settings outside production', () => {
    expect(
      resolveAdsConfig({ ADS_DEBUG_GEOGRAPHY: 'EEA', ADS_TEST_DEVICE_IDS: ' A1, ,B2' }),
    ).toEqual({ ...TEST_IDS, debugGeography: 'EEA', testDeviceIds: ['A1', 'B2'] });
  });

  it('ignores real IDs outside production', () => {
    expect(resolveAdsConfig({ APP_ENV: 'preview', ...REAL })).toMatchObject(TEST_IDS);
  });

  it('uses the real IDs in production and never the debug settings', () => {
    expect(
      resolveAdsConfig({
        APP_ENV: 'production',
        ...REAL,
        ADS_DEBUG_GEOGRAPHY: 'EEA',
        ADS_TEST_DEVICE_IDS: 'A1',
      }),
    ).toEqual({
      appId: REAL.ADMOB_ANDROID_APP_ID,
      banner: REAL.ADMOB_BANNER_ID,
      interstitial: REAL.ADMOB_INTERSTITIAL_ID,
      debugGeography: 'disabled',
      testDeviceIds: [],
    });
  });

  it('fails a production config with a missing ID', () => {
    const { ADMOB_INTERSTITIAL_ID: _omit, ...partial } = REAL;
    expect(() => resolveAdsConfig({ APP_ENV: 'production', ...partial })).toThrow(
      new Error(MESSAGE),
    );
  });

  it('fails a production config that uses a Google test ID', () => {
    expect(() =>
      resolveAdsConfig({
        APP_ENV: 'production',
        ...REAL,
        ADMOB_ANDROID_APP_ID: TEST_IDS.appId,
      }),
    ).toThrow(new Error(MESSAGE));
  });
});

describe('resolveAdsConfig ID validation (production)', () => {
  const prod = (overrides: Record<string, string>) =>
    resolveAdsConfig({ APP_ENV: 'production', ...REAL, ...overrides });

  it('trims surrounding whitespace from real IDs', () => {
    expect(
      prod({
        ADMOB_ANDROID_APP_ID: ` ${REAL.ADMOB_ANDROID_APP_ID}\n`,
        ADMOB_BANNER_ID: `${REAL.ADMOB_BANNER_ID} `,
        ADMOB_INTERSTITIAL_ID: `\t${REAL.ADMOB_INTERSTITIAL_ID}`,
      }),
    ).toMatchObject({
      appId: REAL.ADMOB_ANDROID_APP_ID,
      banner: REAL.ADMOB_BANNER_ID,
      interstitial: REAL.ADMOB_INTERSTITIAL_ID,
    });
  });

  it.each([
    ['a blank app ID', { ADMOB_ANDROID_APP_ID: '   ' }],
    ['a unit ID as the app ID', { ADMOB_ANDROID_APP_ID: REAL.ADMOB_BANNER_ID }],
    ['an app ID as the banner ID', { ADMOB_BANNER_ID: REAL.ADMOB_ANDROID_APP_ID }],
    ['a malformed interstitial ID', { ADMOB_INTERSTITIAL_ID: 'ca-app-pub-1111/abc' }],
    ['an ID with trailing junk', { ADMOB_BANNER_ID: `${REAL.ADMOB_BANNER_ID}x` }],
    ['an ID without the prefix', { ADMOB_BANNER_ID: '1111111111111111/3333333333' }],
    ['the placeholder from the docs', { ADMOB_ANDROID_APP_ID: 'ca-app-pub-xxxxxxxx~yyyyyyyy' }],
    ["Google's test banner ID", { ADMOB_BANNER_ID: TEST_IDS.banner }],
    [
      "any ID under Google's test publisher",
      { ADMOB_INTERSTITIAL_ID: 'ca-app-pub-3940256099942544/9999999999' },
    ],
    ["a padded Google's test app ID", { ADMOB_ANDROID_APP_ID: ` ${TEST_IDS.appId} ` }],
  ])('fails on %s', (_name, overrides) => {
    expect(() => prod(overrides)).toThrow(new Error(MESSAGE));
  });
});

describe('getAdsConfig', () => {
  afterEach(() => {
    mocked.expoConfig = undefined;
  });

  it('reads the ads block from the app config', () => {
    const ads = {
      banner: 'ca-app-pub-1/1',
      interstitial: 'ca-app-pub-1/2',
      debugGeography: 'EEA',
      testDeviceIds: ['A1'],
    };
    mocked.expoConfig = { extra: { ads } };
    expect(getAdsConfig()).toEqual(ads);
  });

  it('falls back to test IDs with debugging off when the block is absent', () => {
    mocked.expoConfig = { extra: {} };
    expect(getAdsConfig()).toEqual({
      banner: TEST_IDS.banner,
      interstitial: TEST_IDS.interstitial,
      debugGeography: 'disabled',
      testDeviceIds: [],
    });
  });
});
