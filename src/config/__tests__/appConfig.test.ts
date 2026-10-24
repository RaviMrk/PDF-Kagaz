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

  describe('AdMob', () => {
    const saved = process.env.APP_ENV;
    afterEach(() => {
      if (saved === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = saved;
    });

    const adsPlugin = (plugins: unknown[]) =>
      plugins.find((p) => Array.isArray(p) && p[0] === 'react-native-google-mobile-ads');

    it("configures the ads plugin with Google's test app ID outside production", () => {
      delete process.env.APP_ENV;
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
        banner: 'ca-app-pub-3940256099942544/9214589741',
        interstitial: 'ca-app-pub-3940256099942544/1033173712',
        debugGeography: 'disabled',
        testDeviceIds: [],
      });
    });

    it('refuses a production config without real AdMob IDs', () => {
      process.env.APP_ENV = 'production';
      expect(() => appConfig({ config: appJson.expo })).toThrow(/real AdMob IDs/);
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
