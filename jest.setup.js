// react-native-mmkv imports react-native-nitro-modules at load time, which throws
// without the native TurboModule. MMKV swaps in its own in-memory mock under Jest,
// so a stub of the nitro entry point is all that is needed.
jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {},
}));

// The pdf-native Expo module has no native side under Jest; every test sees jest.fn fakes.
jest.mock('./modules/pdf-native', () => ({
  __esModule: true,
  default: require('./src/test-utils/fakePdfNative').createFakeNativeModule(),
}));

// @shopify/flash-list/jestSetup (2.0.2) swaps FlashList for `RecyclerView`, which the package no
// longer exports (undefined component). FlashList v2 is the recycler itself, so only the layout
// measurement mocks from that file are kept.
jest.mock('@shopify/flash-list/dist/recyclerview/utils/measureLayout', () => ({
  ...jest.requireActual('@shopify/flash-list/dist/recyclerview/utils/measureLayout'),
  measureParentSize: jest.fn(() => ({ x: 0, y: 0, width: 400, height: 900 })),
  measureFirstChildLayout: jest.fn(() => ({ x: 0, y: 0, width: 400, height: 900 })),
  measureItemLayout: jest.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
}));

// react-native-pdf is a native Fabric view; tests drive its callbacks through the fake's recorded props.
jest.mock('react-native-pdf', () => require('./src/test-utils/fakePdf'));

// react-native-sortables needs Reanimated worklets and gesture handling that do not run under Jest.
jest.mock('react-native-sortables', () => require('./src/test-utils/fakeSortables'));

// Reanimated and Worklets need their native runtime; under Jest both use the packages' own mocks.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// Firebase native modules do not exist under Jest (and are not linked without
// google-services.json); virtual so the mocks hold even if the packages are absent.
jest.mock(
  '@react-native-firebase/app',
  () => ({ getApp: jest.fn(() => ({ name: '[DEFAULT]' })) }),
  { virtual: true },
);
jest.mock(
  '@react-native-firebase/analytics',
  () => {
    const instance = { logEvent: jest.fn(() => Promise.resolve()) };
    return {
      getAnalytics: jest.fn(() => instance),
      logEvent: jest.fn(),
      setAnalyticsCollectionEnabled: jest.fn(() => Promise.resolve()),
    };
  },
  { virtual: true },
);
jest.mock(
  '@react-native-firebase/crashlytics',
  () => {
    const crashlytics = {};
    return {
      getCrashlytics: jest.fn(() => crashlytics),
      setCrashlyticsCollectionEnabled: jest.fn(() => Promise.resolve(null)),
      deleteUnsentReports: jest.fn(() => Promise.resolve()),
      recordError: jest.fn(),
    };
  },
  { virtual: true },
);

// Google Mobile Ads has no native side under Jest. Enum values match the package (17.4.0);
// BannerAd is a host stub whose props tests read through `fakeBannerProps`.
jest.mock('react-native-google-mobile-ads', () => {
  const React = require('react');
  const { View } = require('react-native');
  const AdEventType = {
    LOADED: 'loaded',
    ERROR: 'error',
    OPENED: 'opened',
    CLICKED: 'clicked',
    PAID: 'paid',
    CLOSED: 'closed',
    IMPRESSION: 'impression',
  };
  const banner = { props: null };
  function BannerAd(props) {
    banner.props = props;
    return React.createElement(View, { testID: 'banner-ad' });
  }
  const mobileAdsInstance = {
    initialize: jest.fn(() => Promise.resolve([])),
    setRequestConfiguration: jest.fn(() => Promise.resolve()),
  };
  return {
    __esModule: true,
    default: jest.fn(() => mobileAdsInstance),
    AdsConsent: {
      gatherConsent: jest.fn(),
      getConsentInfo: jest.fn(),
      showPrivacyOptionsForm: jest.fn(),
    },
    AdsConsentDebugGeography: { DISABLED: 0, EEA: 1, NOT_EEA: 2, REGULATED_US_STATE: 3, OTHER: 4 },
    AdsConsentStatus: {
      UNKNOWN: 'UNKNOWN',
      REQUIRED: 'REQUIRED',
      NOT_REQUIRED: 'NOT_REQUIRED',
      OBTAINED: 'OBTAINED',
    },
    AdsConsentPrivacyOptionsRequirementStatus: {
      UNKNOWN: 'UNKNOWN',
      REQUIRED: 'REQUIRED',
      NOT_REQUIRED: 'NOT_REQUIRED',
    },
    MaxAdContentRating: { G: 'G', PG: 'PG', T: 'T', MA: 'MA' },
    TestIds: {
      ADAPTIVE_BANNER: 'ca-app-pub-3940256099942544/9214589741',
      BANNER: 'ca-app-pub-3940256099942544/6300978111',
      INTERSTITIAL: 'ca-app-pub-3940256099942544/1033173712',
    },
    BannerAd,
    BannerAdSize: {
      ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER',
      LARGE_ANCHORED_ADAPTIVE_BANNER: 'LARGE_ANCHORED_ADAPTIVE_BANNER',
    },
    AdEventType,
    InterstitialAd: {
      createForAdRequest: jest.fn(() => ({
        loaded: false,
        load: jest.fn(),
        show: jest.fn(() => Promise.resolve()),
        addAdEventListener: jest.fn(() => jest.fn()),
      })),
    },
    fakeBannerProps: () => banner.props,
  };
});
