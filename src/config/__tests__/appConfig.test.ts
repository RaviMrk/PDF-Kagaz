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
});
