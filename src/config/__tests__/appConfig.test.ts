import fs from 'node:fs';

import appJson from '../../../app.json';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require('../../../app.config').default;

describe('app.config', () => {
  it('registers the app for viewing and receiving PDFs', () => {
    const android = appConfig({ config: appJson.expo }).android;
    expect(android.intentFilters).toEqual(
      expect.arrayContaining([
        { action: 'VIEW', category: ['DEFAULT'], data: [{ mimeType: 'application/pdf' }] },
        { action: 'SEND', category: ['DEFAULT'], data: [{ mimeType: 'application/pdf' }] },
      ]),
    );
    expect(appConfig({ config: appJson.expo }).plugins).toContain('./plugins/withPdfIntentFilters');
    expect(android.blockedPermissions).toEqual(
      expect.arrayContaining(appJson.expo.android.blockedPermissions),
    );
  });

  it('removes the overlay permission from release builds (debug manifests keep theirs)', () => {
    const android = appConfig({ config: appJson.expo }).android!;
    expect(android.blockedPermissions).toContain('android.permission.SYSTEM_ALERT_WINDOW');
  });

  it('blocks the vibrate permission the ads SDK would add', () => {
    expect(appConfig({ config: appJson.expo }).android.blockedPermissions).toContain(
      'android.permission.VIBRATE',
    );
  });

  describe('release hardening', () => {
    const buildProperties = (plugins: unknown[]) =>
      (
        plugins.find((p) => Array.isArray(p) && p[0] === 'expo-build-properties') as [
          string,
          { android: Record<string, unknown> },
        ]
      )[1].android;

    it('turns app backups off and adds the backup rules plugin', () => {
      const config = appConfig({ config: appJson.expo });
      expect(config.android.allowBackup).toBe(false);
      expect(config.plugins).toContain('./plugins/withBackupRules');
    });

    it('minifies and shrinks release builds and strips debug and verbose logs', () => {
      const android = buildProperties(appConfig({ config: appJson.expo }).plugins);
      expect(android.enableMinifyInReleaseBuilds).toBe(true);
      expect(android.enableShrinkResourcesInReleaseBuilds).toBe(true);
      expect(android.extraProguardRules).toContain(
        '-assumenosideeffects class android.util.Log { public static int d(...); public static int v(...); }',
      );
    });
  });

  it('keeps the Crashlytics switch that pdf-native calls by reflection', () => {
    const android = (
      appConfig({ config: appJson.expo }).plugins.find(
        (p: unknown) => Array.isArray(p) && p[0] === 'expo-build-properties',
      ) as [string, { android: { extraProguardRules: string } }]
    )[1].android;
    expect(android.extraProguardRules).toContain(
      '-keep class com.google.firebase.crashlytics.FirebaseCrashlytics { public static ** getInstance(); public void setCrashlyticsCollectionEnabled(java.lang.Boolean); }',
    );
  });

  describe('privacy policy URL', () => {
    const KEYS = [
      'ADS_ENABLED',
      'APP_ENV',
      'PRIVACY_POLICY_URL',
      'ADMOB_ANDROID_APP_ID',
      'ADMOB_BANNER_ID',
      'ADMOB_INTERSTITIAL_ID',
    ] as const;
    const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    afterEach(() => {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    });
    const production = (url: string | undefined) => {
      process.env.ADS_ENABLED = 'true';
      process.env.APP_ENV = 'production';
      process.env.ADMOB_ANDROID_APP_ID = 'ca-app-pub-1111111111111111~2222222222';
      process.env.ADMOB_BANNER_ID = 'ca-app-pub-1111111111111111/3333333333';
      process.env.ADMOB_INTERSTITIAL_ID = 'ca-app-pub-1111111111111111/4444444444';
      if (url === undefined) delete process.env.PRIVACY_POLICY_URL;
      else process.env.PRIVACY_POLICY_URL = url;
      return () => appConfig({ config: appJson.expo });
    };

    it.each([
      ['missing', undefined],
      ['blank', '  '],
      ['http', 'http://example.com/privacy'],
      ['not a URL', 'example.com/privacy'],
      ['https without a host', 'https://'],
    ])('refuses a production config with a %s URL', (_name, url) => {
      expect(production(url)).toThrow(
        new Error('Production build needs PRIVACY_POLICY_URL set to an https:// URL'),
      );
    });

    it('uses the trimmed https URL in production', () => {
      expect(production(' https://example.com/privacy ')().extra.privacyPolicyUrl).toBe(
        'https://example.com/privacy',
      );
    });

    it('allows no URL outside production', () => {
      delete process.env.APP_ENV;
      delete process.env.PRIVACY_POLICY_URL;
      expect(appConfig({ config: appJson.expo }).extra.privacyPolicyUrl).toBeNull();
    });
  });

  describe('AdMob', () => {
    const KEYS = [
      'ADS_ENABLED',
      'APP_ENV',
      'PRIVACY_POLICY_URL',
      'ADMOB_ANDROID_APP_ID',
      'ADMOB_BANNER_ID',
      'ADMOB_INTERSTITIAL_ID',
    ] as const;
    const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    beforeEach(() => {
      for (const k of KEYS) delete process.env[k];
    });
    afterEach(() => {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    });

    const adsPlugin = (plugins: unknown[]) =>
      plugins.find((p) => Array.isArray(p) && p[0] === 'react-native-google-mobile-ads');

    it("configures the ads plugin with Google's test app ID outside production", () => {
      process.env.ADS_ENABLED = 'true';
      const config = appConfig({ config: appJson.expo });
      expect(adsPlugin(config.plugins)).toEqual([
        'react-native-google-mobile-ads',
        {
          androidAppId: 'ca-app-pub-3940256099942544~3347511713',
          delayAppMeasurementInit: true,
          optimizeInitialization: true,
          optimizeAdLoading: true,
        },
      ]);
      expect(config.extra.ads).toEqual({
        enabled: true,
        banner: 'ca-app-pub-3940256099942544/9214589741',
        interstitial: 'ca-app-pub-3940256099942544/1033173712',
        debugGeography: 'disabled',
        testDeviceIds: [],
      });
    });

    it('refuses a production config with ads on and without real AdMob IDs', () => {
      process.env.APP_ENV = 'production';
      process.env.ADS_ENABLED = 'true';
      process.env.PRIVACY_POLICY_URL = 'https://example.com/privacy';
      expect(() => appConfig({ config: appJson.expo })).toThrow(/real AdMob IDs/);
    });

    it('builds a production config with ads off and no AdMob IDs, keeping the manifest app ID', () => {
      process.env.APP_ENV = 'production';
      process.env.PRIVACY_POLICY_URL = 'https://example.com/privacy';
      const config = appConfig({ config: appJson.expo });
      expect(config.extra.ads.enabled).toBe(false);
      expect(adsPlugin(config.plugins)).toEqual([
        'react-native-google-mobile-ads',
        expect.objectContaining({ androidAppId: 'ca-app-pub-3940256099942544~3347511713' }),
      ]);
    });

    it('still refuses production with ads off and no privacy policy URL', () => {
      process.env.APP_ENV = 'production';
      expect(() => appConfig({ config: appJson.expo })).toThrow(/PRIVACY_POLICY_URL/);
    });

    it('is off by default', () => {
      expect(appConfig({ config: appJson.expo }).extra.ads.enabled).toBe(false);
    });
  });

  describe('Firebase', () => {
    const saved = process.env.GOOGLE_SERVICES_JSON;
    afterEach(() => {
      jest.restoreAllMocks();
      if (saved === undefined) delete process.env.GOOGLE_SERVICES_JSON;
      else process.env.GOOGLE_SERVICES_JSON = saved;
    });

    const firebasePlugins = (plugins: unknown[]) =>
      plugins.filter((p) =>
        (Array.isArray(p) ? p[0] : p).toString().startsWith('@react-native-firebase/'),
      );

    it('leaves Firebase out without google-services.json', () => {
      delete process.env.GOOGLE_SERVICES_JSON;
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      const config = appConfig({ config: appJson.expo });
      expect(firebasePlugins(config.plugins)).toEqual([]);
      expect(config.android.googleServicesFile).toBeUndefined();
      expect(config.extra.firebaseEnabled).toBe(false);
    });

    it('adds the app and crashlytics plugins and the file when it exists', () => {
      process.env.GOOGLE_SERVICES_JSON = '/x/g.json';
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => p === '/x/g.json');
      const config = appConfig({ config: appJson.expo });
      expect(firebasePlugins(config.plugins)).toEqual([
        '@react-native-firebase/app',
        '@react-native-firebase/crashlytics',
      ]);
      expect(config.android.googleServicesFile).toBe('/x/g.json');
      expect(config.extra.firebaseEnabled).toBe(true);
    });
  });
});
