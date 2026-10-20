const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const PREFIX = 'android.permission.';

function upsertPermission(manifest, name, attrs) {
  const list = (manifest.manifest['uses-permission'] ??= []);
  const fullName = `${PREFIX}${name}`;
  const existing = list.find((p) => p.$['android:name'] === fullName);
  if (existing) {
    Object.assign(existing.$, attrs);
    return;
  }
  list.push({ $: { 'android:name': fullName, ...attrs } });
}

/**
 * Applies the storage permissions of the PDF Toolkit manifest (spec section 5).
 * When allFilesAccess is false, MANAGE_EXTERNAL_STORAGE is added by nothing here;
 * the android.blockedPermissions list removes it from merged manifests.
 */
function applyStoragePermissions(manifest, { allFilesAccess }) {
  AndroidConfig.Manifest.ensureToolsAvailable(manifest);

  upsertPermission(manifest, 'READ_EXTERNAL_STORAGE', {
    'android:maxSdkVersion': '32',
    'tools:replace': 'android:maxSdkVersion',
  });
  upsertPermission(manifest, 'WRITE_EXTERNAL_STORAGE', {
    'android:maxSdkVersion': '29',
    'tools:replace': 'android:maxSdkVersion',
  });
  if (allFilesAccess) {
    upsertPermission(manifest, 'MANAGE_EXTERNAL_STORAGE', { 'tools:ignore': 'ScopedStorage' });
  }

  const application = manifest.manifest.application?.[0];
  if (application) {
    application.$['android:requestLegacyExternalStorage'] = 'true';
  }
  return manifest;
}

const withStoragePermissions = (config, { allFilesAccess }) =>
  withAndroidManifest(config, (cfg) => {
    cfg.modResults = applyStoragePermissions(cfg.modResults, { allFilesAccess });
    return cfg;
  });

module.exports = withStoragePermissions;
module.exports.default = withStoragePermissions;
module.exports.applyStoragePermissions = applyStoragePermissions;
