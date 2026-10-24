const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

/**
 * No backups of app data. The index holds content URIs and URI grants that are invalid on another
 * install, so restoring it is wrong. `android:allowBackup="false"` (app.json) covers cloud backup
 * on every version; Android 12+ ignores it for device-to-device transfer, so the
 * data-extraction rules exclude every domain from both cloud backup and device transfer.
 * `fullBackupContent="false"` turns off Auto Backup's content on Android 11 and lower.
 */
const RULES_FILE = 'data_extraction_rules';
const DOMAINS = ['root', 'file', 'database', 'sharedpref', 'external'];

function backupRulesXml() {
  const excludes = DOMAINS.map((d) => `    <exclude domain="${d}" path="."/>`).join('\n');
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<data-extraction-rules>',
    '  <cloud-backup>',
    excludes,
    '  </cloud-backup>',
    '  <device-transfer>',
    excludes,
    '  </device-transfer>',
    '</data-extraction-rules>',
    '',
  ].join('\n');
}

function applyBackupRules(manifest) {
  for (const application of manifest.manifest.application ?? []) {
    application.$ = {
      ...application.$,
      'android:dataExtractionRules': `@xml/${RULES_FILE}`,
      'android:fullBackupContent': 'false',
    };
  }
  return manifest;
}

const withBackupRules = (config) => {
  config = withAndroidManifest(config, (cfg) => {
    cfg.modResults = applyBackupRules(cfg.modResults);
    return cfg;
  });
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${RULES_FILE}.xml`), backupRulesXml());
      return cfg;
    },
  ]);
};

module.exports = withBackupRules;
module.exports.default = withBackupRules;
module.exports.applyBackupRules = applyBackupRules;
module.exports.backupRulesXml = backupRulesXml;
