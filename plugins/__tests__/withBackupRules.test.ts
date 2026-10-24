// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyBackupRules, backupRulesXml } = require('../withBackupRules');

const DOMAINS = ['root', 'file', 'database', 'sharedpref', 'external'];

function section(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!match) throw new Error(`no <${tag}>`);
  return match[1] ?? '';
}

function manifest() {
  return {
    manifest: {
      $: {},
      application: [{ $: { 'android:name': '.MainApplication', 'android:allowBackup': 'false' } }],
    },
  };
}

describe('backupRulesXml', () => {
  const xml: string = backupRulesXml();

  it('is a data-extraction-rules document', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(xml).toContain('<data-extraction-rules>');
  });

  it.each(['cloud-backup', 'device-transfer'])('excludes every domain from %s', (tag) => {
    const body = section(xml, tag);
    const excludes = [...body.matchAll(/<exclude domain="([a-z]+)" path="\."\/>/g)].map(
      (m) => m[1],
    );
    expect(excludes).toEqual(DOMAINS);
    expect(body).not.toContain('<include');
  });
});

describe('applyBackupRules', () => {
  it('points the application at the rules and turns full backup content off', () => {
    const app = applyBackupRules(manifest()).manifest.application[0].$;
    expect(app['android:dataExtractionRules']).toBe('@xml/data_extraction_rules');
    expect(app['android:fullBackupContent']).toBe('false');
    expect(app['android:allowBackup']).toBe('false');
  });

  it('is idempotent', () => {
    const once = applyBackupRules(manifest());
    const twice = applyBackupRules(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });
});
