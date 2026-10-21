import appJson from '../../app.json';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyStoragePermissions } = require('../withStoragePermissions');

type Perm = { $: Record<string, string> };

function makeManifest() {
  return {
    manifest: {
      $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' } as Record<
        string,
        string
      >,
      application: [{ $: { 'android:name': '.MainApplication' } as Record<string, string> }],
      'uses-permission': [] as Perm[],
    },
  };
}

function perms(manifest: ReturnType<typeof makeManifest>): Perm[] {
  return manifest.manifest['uses-permission'] ?? [];
}

function find(manifest: ReturnType<typeof makeManifest>, name: string): Perm | undefined {
  return perms(manifest).find((p) => p.$['android:name'] === `android.permission.${name}`);
}

describe('applyStoragePermissions', () => {
  it('adds READ, WRITE and MANAGE with allFilesAccess true', () => {
    const m = applyStoragePermissions(makeManifest(), { allFilesAccess: true });
    expect(find(m, 'READ_EXTERNAL_STORAGE')?.$['android:maxSdkVersion']).toBe('32');
    expect(find(m, 'WRITE_EXTERNAL_STORAGE')?.$['android:maxSdkVersion']).toBe('29');
    // A library declaring READ/WRITE without maxSdkVersion (react-native-blob-util) makes the
    // manifest merger drop the cap despite tools:replace; replacing the whole element keeps it.
    expect(find(m, 'READ_EXTERNAL_STORAGE')?.$['tools:node']).toBe('replace');
    expect(find(m, 'WRITE_EXTERNAL_STORAGE')?.$['tools:node']).toBe('replace');
    expect(find(m, 'READ_EXTERNAL_STORAGE')?.$['tools:replace']).toBeUndefined();
    expect(find(m, 'WRITE_EXTERNAL_STORAGE')?.$['tools:replace']).toBeUndefined();
    expect(find(m, 'MANAGE_EXTERNAL_STORAGE')?.$['tools:ignore']).toBe('ScopedStorage');
    expect(m.manifest.application[0].$['android:requestLegacyExternalStorage']).toBe('true');
    expect(m.manifest.$['xmlns:tools']).toBeDefined();
  });

  it('omits MANAGE with allFilesAccess false but keeps READ/WRITE and legacy flag', () => {
    const m = applyStoragePermissions(makeManifest(), { allFilesAccess: false });
    expect(find(m, 'MANAGE_EXTERNAL_STORAGE')).toBeUndefined();
    expect(find(m, 'READ_EXTERNAL_STORAGE')).toBeDefined();
    expect(find(m, 'WRITE_EXTERNAL_STORAGE')).toBeDefined();
    expect(m.manifest.application[0].$['android:requestLegacyExternalStorage']).toBe('true');
  });

  it('does not duplicate entries when applied twice', () => {
    const once = applyStoragePermissions(makeManifest(), { allFilesAccess: true });
    const twice = applyStoragePermissions(once, { allFilesAccess: true });
    expect(perms(twice)).toHaveLength(3);
  });
});

describe('app.config', () => {
  const original = process.env.APP_VARIANT;
  afterEach(() => {
    if (original === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = original;
  });

  function load() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../../app.config').default({ config: appJson.expo });
  }

  it('blocks MANAGE and disables all-files access for play-saf', () => {
    process.env.APP_VARIANT = 'play-saf';
    const cfg = load();
    expect(cfg.android.blockedPermissions).toContain('android.permission.MANAGE_EXTERNAL_STORAGE');
    expect(cfg.android.blockedPermissions).toContain('android.permission.CAMERA');
    expect(cfg.extra.allFilesAccessEnabled).toBe(false);
  });

  it('enables all-files access for the default variant', () => {
    delete process.env.APP_VARIANT;
    const cfg = load();
    expect(cfg.android.blockedPermissions).not.toContain(
      'android.permission.MANAGE_EXTERNAL_STORAGE',
    );
    expect(cfg.extra.allFilesAccessEnabled).toBe(true);
    expect(cfg.android.package).toBe('com.pdfkagaz.pdftoolkit');
  });
});
