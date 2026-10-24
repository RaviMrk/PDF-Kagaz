import eas from '../../../eas.json';

describe('eas.json', () => {
  it('builds production as an auto-incremented app bundle with real ad IDs', () => {
    expect(eas.build.production).toEqual({
      autoIncrement: true,
      env: { APP_ENV: 'production' },
      android: { buildType: 'app-bundle' },
    });
  });

  it('builds the SAF variant from the production profile', () => {
    expect(eas.build['production-saf']).toEqual({
      extends: 'production',
      env: { APP_ENV: 'production', APP_VARIANT: 'play-saf' },
    });
  });

  it('marks preview builds as preview (test ad IDs)', () => {
    expect(eas.build.preview).toEqual({
      distribution: 'internal',
      env: { APP_ENV: 'preview' },
      android: { buildType: 'apk' },
    });
  });

  it('submits production builds to the internal track', () => {
    expect(eas.submit.production).toEqual({ android: { track: 'internal' } });
  });
});
