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
  process.stdout.write(JSON.stringify({ configs, lint }));
})();`;

const { configs, lint } = JSON.parse(
  execFileSync(process.execPath, ['-e', SCRIPT], {
    cwd: path.join(__dirname, '..', '..', '..', '..'),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  }),
) as { configs: Record<string, Config>; lint: Record<string, Record<string, number>> };

const SELECTOR_MODULE = /value='([^']+)'/;
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
      if (m?.[1]) names.add(m[1]);
    }
  }
  return [...names].sort();
}

const PDF = '@cantoo/pdf-lib';
const FS = 'expo-file-system';
describe('import restrictions', () => {
  it.each([
    ['app/index.tsx', [PDF, FS, SORT]],
    ['src/components/Button.tsx', [PDF, FS]],
    ['src/components/__tests__/Button.test.tsx', [FS]],
    ['src/test-utils/pdfFixtures.ts', [FS]],
    ['src/services/pdf/merge.ts', [FS, SORT]],
    ['src/services/pdf/__tests__/merge.test.ts', [FS, SORT]],
    ['src/services/tools/toolFs.ts', [PDF, SORT]],
    // expo-file-system is enforced for TypeScript files only (plugin availability)
    ['scripts/make-fixtures.mjs', [SORT]],
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
