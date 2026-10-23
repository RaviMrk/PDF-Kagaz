/** @jest-environment node */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

type Entry = string | { name: string };
type Config = { rules?: Record<string, unknown[]> };

const FILES = [
  'app/index.tsx',
  'src/components/Button.tsx',
  'src/components/__tests__/Button.test.tsx',
  'src/test-utils/pdfFixtures.ts',
  'src/services/pdf/merge.ts',
  'src/services/pdf/__tests__/merge.test.ts',
  'src/services/tools/toolFs.ts',
  'scripts/make-fixtures.mjs',
  'src/components/AdBanner.tsx',
  'src/components/AdsLifecycle.tsx',
  'app/(tabs)/home.tsx',
  'app/(tabs)/files.tsx',
  'app/result.tsx',
  'src/services/ads/x.ts',
  'src/services/telemetry/telemetry.ts',
  'src/services/telemetry/firebaseTelemetry.ts',
  'jest.setup.js',
];

// ESLint loads its config through a dynamic import, which Jest's VM cannot do, so ask a child
// Node process for the resolved config of each file.
const SORT = 'react-native-sortables';
const ALLOWED_FILE = 'src/components/tools/ReorderFiles.tsx';
const OUTSIDE_FILE = 'app/index.tsx';

// Every way a module can be pulled in, so a re-export, require() or import() cannot sidestep the
// restriction on a plain import.
const SORTABLES_USES: Record<string, string> = {
  'default import': `import Sortable from '${SORT}'; export const a = Sortable;`,
  'named re-export': `export { default } from '${SORT}';`,
  'export all': `export * from '${SORT}';`,
  require: `export const a = require('${SORT}');`,
  'dynamic import': `export const a = () => import('${SORT}');`,
  'import-equals require': `import a = require('${SORT}'); export { a };`,
};

// Ads and Firebase: [code, file, allowed?]
const ADS = 'react-native-google-mobile-ads';
// Every way AdBanner can be pulled in.
const AD_BANNER_FORMS = [
  `import { AdBanner } from '@/components/AdBanner'; export const a = AdBanner;`,
  `export { AdBanner } from './AdBanner';`,
  `export * from '@/components/AdBanner';`,
  `export const a = require('@/components/AdBanner');`,
  `export const a = () => import('@/components/AdBanner');`,
  `import a = require('@/components/AdBanner'); export { a };`,
];
const ZONE_CASES: [string, string, boolean][] = [
  [`import '${ADS}';`, 'app/index.tsx', false],
  [`import '${ADS}';`, 'src/components/Button.tsx', false],
  [`import '${ADS}';`, 'src/services/ads/x.ts', true],
  [`import '${ADS}';`, 'src/components/AdBanner.tsx', true],
  ...AD_BANNER_FORMS.flatMap((code): [string, string, boolean][] => [
    [code, 'app/(tabs)/home.tsx', true],
    [code, 'app/(tabs)/files.tsx', true],
    [code, 'app/(tabs)/settings.tsx', false],
    [code, 'app/reader/[id].tsx', false],
    [code, 'src/components/FileRow.tsx', false],
    [code, 'src/components/PermissionGate.tsx', false],
  ]),
  [`import { interstitial } from '@/services/ads/interstitial';`, 'app/result.tsx', true],
  [`import { interstitial } from '@/services/ads/interstitial';`, 'app/scan.tsx', false],
  [
    `import { interstitial } from '@/services/ads/interstitial';`,
    'src/components/AdsLifecycle.tsx',
    true,
  ],
  [
    `import { interstitial } from '@/services/ads/interstitial';`,
    'src/components/FileRow.tsx',
    false,
  ],
  [
    `export const a = require('@react-native-firebase/app');`,
    'src/services/telemetry/telemetry.ts',
    false,
  ],
  [
    `export const a = require('@react-native-firebase/app');`,
    'src/services/telemetry/firebaseTelemetry.ts',
    true,
  ],
  [
    `import { getAnalytics } from '@react-native-firebase/analytics'; export const a = getAnalytics;`,
    'app/index.tsx',
    false,
  ],
  [
    `import { getAnalytics } from '@react-native-firebase/analytics'; export const a = getAnalytics;`,
    'src/services/telemetry/firebaseTelemetry.ts',
    true,
  ],
  [
    `import { firebaseTelemetry } from '@/services/telemetry/firebaseTelemetry'; export const a = firebaseTelemetry;`,
    'app/index.tsx',
    false,
  ],
  [
    `export const a = require('./firebaseTelemetry');`,
    'src/services/telemetry/toolEvent.ts',
    false,
  ],
  [`export const a = require('./firebaseTelemetry');`, 'src/services/telemetry/telemetry.ts', true],
];

const SCRIPT = `
const { ESLint } = require('eslint');
const eslint = new ESLint();
(async () => {
  const configs = {};
  for (const f of ${JSON.stringify(FILES)}) configs[f] = await eslint.calculateConfigForFile(f);
  const lint = {};
  for (const [name, code] of Object.entries(${JSON.stringify(SORTABLES_USES)})) {
    lint[name] = {};
    for (const filePath of ${JSON.stringify([OUTSIDE_FILE, ALLOWED_FILE])}) {
      const [r] = await eslint.lintText(code, { filePath });
      lint[name][filePath] = r.messages.filter((m) => m.ruleId === 'no-restricted-syntax').length;
    }
  }
  const zones = [];
  for (const [code, filePath] of ${JSON.stringify(ZONE_CASES)}) {
    const [r] = await eslint.lintText(code, { filePath });
    zones.push(r.messages.filter((m) => m.ruleId === 'no-restricted-syntax').length);
  }
  process.stdout.write(JSON.stringify({ configs, lint, zones }));
})();`;

const { configs, lint, zones } = JSON.parse(
  execFileSync(process.execPath, ['-e', SCRIPT], {
    cwd: path.join(__dirname, '..', '..', '..', '..'),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  }),
) as {
  configs: Record<string, Config>;
  lint: Record<string, Record<string, number>>;
  zones: number[];
};

// A module name (`value='x'`) or a module pattern (`value=/x/`).
const SELECTOR_MODULE = /value=(?:'([^']+)'|(\/.+\/))\]/;
const isOn = (rule?: unknown[]) => rule !== undefined && rule[0] !== 0 && rule[0] !== 'off';

function restricted(file: string): string[] {
  const rules = configs[file]?.rules ?? {};
  const names = new Set<string>();
  for (const key of ['no-restricted-imports', '@typescript-eslint/no-restricted-imports']) {
    if (!isOn(rules[key])) continue;
    const paths = (rules[key]?.[1] as { paths?: Entry[] } | undefined)?.paths;
    for (const p of paths ?? []) names.add(typeof p === 'string' ? p : p.name);
  }
  const syntax = rules['no-restricted-syntax'];
  if (isOn(syntax)) {
    for (const s of (syntax ?? []).slice(1) as { selector: string }[]) {
      const m = SELECTOR_MODULE.exec(s.selector);
      const name = m?.[1] ?? m?.[2];
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

const PDF = '@cantoo/pdf-lib';
const FS = 'expo-file-system';
const FB = '/^@react-native-firebase\\//';
// The Firebase adapter module itself (only telemetry.ts loads it).
const AB = '/(^|\\/)AdBanner$/';
const INT = '/(^|\\/)interstitial$/';
const FBA = '/(^|\\/)firebaseTelemetry(\\.ts)?$/';
describe('import restrictions', () => {
  it.each([
    ['app/index.tsx', [PDF, FS, SORT, ADS, FB, FBA, AB, INT]],
    ['src/components/Button.tsx', [PDF, FS, ADS, FB, FBA, AB, INT]],
    ['src/components/AdBanner.tsx', [PDF, FS, FB, FBA, AB, INT]],
    ['src/components/AdsLifecycle.tsx', [PDF, FS, ADS, FB, FBA, AB]],
    ['app/(tabs)/home.tsx', [PDF, FS, SORT, ADS, FB, FBA, INT]],
    ['app/(tabs)/files.tsx', [PDF, FS, SORT, ADS, FB, FBA, INT]],
    ['app/result.tsx', [PDF, FS, SORT, ADS, FB, FBA, AB]],
    ['src/services/ads/x.ts', [PDF, FS, SORT, FB, FBA, AB, INT]],
    ['src/services/telemetry/telemetry.ts', [PDF, FS, SORT, ADS, FB, AB, INT]],
    ['src/services/telemetry/firebaseTelemetry.ts', [PDF, FS, SORT, ADS, FBA, AB, INT]],
    // Tests, test utilities and the Jest setup may import ads, Firebase and sortables (mocks).
    ['src/components/__tests__/Button.test.tsx', [FS]],
    ['src/test-utils/pdfFixtures.ts', [FS]],
    ['src/services/pdf/merge.ts', [FS, SORT, ADS, FB, FBA, AB, INT]],
    ['src/services/pdf/__tests__/merge.test.ts', [FS]],
    ['src/services/tools/toolFs.ts', [PDF, SORT, ADS, FB, FBA, AB, INT]],
    ['jest.setup.js', [PDF]],
    // expo-file-system is enforced for TypeScript files only (plugin availability)
    ['scripts/make-fixtures.mjs', [SORT, ADS, FB, FBA, AB, INT]],
  ])('%s restricts %j', (file, expected) => {
    expect(restricted(file)).toEqual([...expected].sort());
  });
});

describe('react-native-sortables import forms', () => {
  it.each(Object.keys(SORTABLES_USES))('%s is an error outside the allowed zone', (name) => {
    expect(lint[name]?.[OUTSIDE_FILE]).toBeGreaterThan(0);
  });
  it.each(Object.keys(SORTABLES_USES))('%s is allowed in src/components', (name) => {
    expect(lint[name]?.[ALLOWED_FILE]).toBe(0);
  });
});

describe('ads and Firebase zones', () => {
  it.each(ZONE_CASES.map(([code, file, allowed], i) => [i, code, file, allowed] as const))(
    '#%d %s in %s allowed=%s',
    (i, _code, _file, allowed) => {
      if (allowed) expect(zones[i]).toBe(0);
      else expect(zones[i]).toBeGreaterThan(0);
    },
  );
});
