const { AndroidConfig, withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');

const PREFIX = 'android.permission.';

/** maxSdkVersion caps: READ is replaced by the photo picker/SAF on 33+, WRITE by scoped storage on 30+. */
const MAX_SDK = { READ_EXTERNAL_STORAGE: '32', WRITE_EXTERNAL_STORAGE: '29' };

const RESTORE_MARKER = '// pdf-toolkit: restore storage maxSdkVersion caps';

/**
 * expo-max-sdk-override-plugin removes maxSdkVersion from a permission that some library declares
 * without it. Its merge-report parser also counts the sources of the element after the permission
 * (`queries`), so WRITE_EXTERNAL_STORAGE loses its cap even though tools:node="replace" rejected
 * every library declaration. This appends a last action to that task (it has no switch) that puts
 * the caps back, and fails the build if a capped permission is still uncapped.
 */
function restoreMaxSdkCaps(buildGradle) {
  if (buildGradle.includes(RESTORE_MARKER)) return buildGradle;
  const caps = Object.entries(MAX_SDK)
    .map(([name, max]) => `'${PREFIX}${name}': '${max}'`)
    .join(', ');
  return `${buildGradle}
${RESTORE_MARKER}
tasks.matching { it.name ==~ /expo\\w*OverrideMaxSdkConflicts/ }.configureEach { task ->
    task.doLast {
        def caps = [${caps}]
        def file = task.modifiedManifestOut.get().asFile
        def nameOf = { String element ->
            def m = element =~ /android:name="([^"]+)"/
            m.find() ? m.group(1) : null
        }
        def text = file.text.replaceAll(/<uses-permission\\b[^>]*>/) { String element ->
            def name = nameOf(element)
            if (!caps.containsKey(name) || element.contains('android:maxSdkVersion')) return element
            element.replaceFirst(/android:name="[^"]+"/, "android:name=\\"\${name}\\" android:maxSdkVersion=\\"\${caps[name]}\\"")
        }
        def uncapped = (text =~ /<uses-permission\\b[^>]*>/).collect { it }.findAll { String element ->
            caps.containsKey(nameOf(element)) && !element.contains('android:maxSdkVersion')
        }
        if (!uncapped.isEmpty()) throw new GradleException("Storage permission lost its maxSdkVersion: \${uncapped}")
        file.text = text
    }
}
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
