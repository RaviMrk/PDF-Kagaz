const { AndroidConfig, withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');

const PREFIX = 'android.permission.';

/** maxSdkVersion caps: READ is replaced by the photo picker/SAF on 33+, WRITE by scoped storage on 30+. */
const MAX_SDK = { READ_EXTERNAL_STORAGE: '32', WRITE_EXTERNAL_STORAGE: '29' };

const RESTORE_MARKER = '// pdf-toolkit: storage maxSdkVersion caps (plugins/storage-caps.gradle)';

/**
 * expo-max-sdk-override-plugin strips WRITE_EXTERNAL_STORAGE's maxSdkVersion from the merged
 * manifest (its merge-report parser misattributes the `queries` sources to the permission), even
 * though tools:node="replace" rejected every library declaration. plugins/storage-caps.gradle
 * restores the caps in its own merged-manifest transform and fails assemble/bundle when the final
 * manifest still lacks them. This hands it the caps and applies it to the app module.
 */
function restoreMaxSdkCaps(buildGradle) {
  if (buildGradle.includes(RESTORE_MARKER)) return buildGradle;
  const caps = Object.entries(MAX_SDK)
    .map(([name, max]) => `'${PREFIX}${name}': '${max}'`)
    .join(', ');
  return `${buildGradle}
${RESTORE_MARKER}
ext.pdfToolkitStorageCaps = [${caps}]
apply from: "\${projectRoot}/plugins/storage-caps.gradle"
`;
}

function upsertPermission(manifest, name, attrs) {
  const list = (manifest.manifest['uses-permission'] ??= []);
  const fullName = `${PREFIX}${name}`;
  const existing = list.find((p) => p.$['android:name'] === fullName);
  if (existing) {
    delete existing.$['tools:replace'];
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

  // tools:node="replace", not tools:replace: when a library declares the permission without
  // maxSdkVersion (react-native-blob-util), the merger drops the cap unless the element is replaced.
  upsertPermission(manifest, 'READ_EXTERNAL_STORAGE', {
    'android:maxSdkVersion': MAX_SDK.READ_EXTERNAL_STORAGE,
    'tools:node': 'replace',
  });
  upsertPermission(manifest, 'WRITE_EXTERNAL_STORAGE', {
    'android:maxSdkVersion': MAX_SDK.WRITE_EXTERNAL_STORAGE,
    'tools:node': 'replace',
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

const withStoragePermissions = (config, { allFilesAccess }) => {
  config = withAndroidManifest(config, (cfg) => {
    cfg.modResults = applyStoragePermissions(cfg.modResults, { allFilesAccess });
    return cfg;
  });
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = restoreMaxSdkCaps(cfg.modResults.contents);
    return cfg;
  });
};

module.exports = withStoragePermissions;
module.exports.default = withStoragePermissions;
module.exports.applyStoragePermissions = applyStoragePermissions;
module.exports.restoreMaxSdkCaps = restoreMaxSdkCaps;
