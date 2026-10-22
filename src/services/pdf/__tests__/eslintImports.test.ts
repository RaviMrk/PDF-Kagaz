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
const SCRIPT = `
const { ESLint } = require('eslint');
const eslint = new ESLint();
(async () => {
  const out = {};
  for (const f of ${JSON.stringify(FILES)}) out[f] = await eslint.calculateConfigForFile(f);
  process.stdout.write(JSON.stringify(out));
})();`;

const configs = JSON.parse(
  execFileSync(process.execPath, ['-e', SCRIPT], {
    cwd: path.join(__dirname, '..', '..', '..', '..'),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  }),
) as Record<string, Config>;

const isOn = (rule?: unknown[]) => rule !== undefined && rule[0] !== 0 && rule[0] !== 'off';

function restricted(file: string): string[] {
  const rules = configs[file]?.rules ?? {};
  const names: string[] = [];
  for (const key of ['no-restricted-imports', '@typescript-eslint/no-restricted-imports']) {
    if (!isOn(rules[key])) continue;
    const paths = (rules[key]?.[1] as { paths?: Entry[] } | undefined)?.paths;
    for (const p of paths ?? []) names.push(typeof p === 'string' ? p : p.name);
  }
  const syntax = rules['no-restricted-syntax'];
  if (isOn(syntax)) {
    for (const s of (syntax ?? []).slice(1) as { selector: string }[]) {
      const m = /value='([^']+)'/.exec(s.selector);
      if (m?.[1]) names.push(m[1]);
    }
  }
  return names.sort();
}

const PDF = '@cantoo/pdf-lib';
const FS = 'expo-file-system';
const SORT = 'react-native-sortables';

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
