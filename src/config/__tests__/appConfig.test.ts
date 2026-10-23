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
