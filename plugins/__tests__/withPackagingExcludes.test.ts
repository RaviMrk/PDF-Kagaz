import appJson from '../../app.json';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require('../../app.config').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addPackagingExcludes, EXCLUDES } = require('../withPackagingExcludes');

const GRADLE = 'apply plugin: "com.android.application"\n\nandroid {\n  namespace "x"\n}\n';

describe('addPackagingExcludes', () => {
  it('excludes the unused BouncyCastle post-quantum resources from the app packaging', () => {
    const out: string = addPackagingExcludes(GRADLE);
    expect(EXCLUDES).toEqual(['org/bouncycastle/pqc/**']);
    expect(out.startsWith(GRADLE)).toBe(true);
    expect(out).toContain(
      "packaging {\n    resources {\n      excludes += ['org/bouncycastle/pqc/**']",
    );
  });

  it('is idempotent', () => {
    const once = addPackagingExcludes(GRADLE);
    expect(addPackagingExcludes(once)).toBe(once);
  });

  it('is registered in the app config', () => {
    expect(appConfig({ config: appJson.expo }).plugins).toContain(
      './plugins/withPackagingExcludes',
    );
  });
});
