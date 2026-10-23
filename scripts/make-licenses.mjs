// Writes src/config/licenses.json from the production dependency tree (npm ls --omit=dev --all).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// pdf-native is in-repo. jest and typescript only appear through peer or optional edges
// (testing-library, i18next); they are never bundled into the app.
const EXCLUDED = new Set(['pdf-native', 'jest', 'eslint', 'typescript']);

// npm ls exits non-zero for extraneous or peer problems but still prints the tree.
let raw;
try {
  raw = execFileSync('npm', ['ls', '--omit=dev', '--all', '--long', '--json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 256 * 1024 * 1024,
  });
} catch (e) {
  if (!e.stdout) throw e;
  raw = e.stdout;
}
const tree = JSON.parse(raw);

const found = new Map();
(function walk(deps) {
  for (const [name, node] of Object.entries(deps ?? {})) {
    if (node.version && !EXCLUDED.has(name))
      found.set(`${name}@${node.version}`, { name, version: node.version, dir: node.path });
    walk(node.dependencies);
  }
})(tree.dependencies);

function spdx(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const parts = value.map(spdx).filter(Boolean);
    return parts.length ? parts.join(' OR ') : null;
  }
  return value.type ?? null;
}

function licenseOf(name, dir) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(dir ?? path.join(root, 'node_modules', name), 'package.json'),
        'utf8',
      ),
    );
    return spdx(pkg.license) ?? spdx(pkg.licenses) ?? 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const list = [...found.values()]
  .map(({ name, version, dir }) => ({ name, version, license: licenseOf(name, dir) }))
  .sort((a, b) => cmp(a.name, b.name) || cmp(a.version, b.version));

fs.writeFileSync(path.join(root, 'src/config/licenses.json'), `${JSON.stringify(list, null, 2)}\n`);
console.log(`Wrote ${list.length} licences`);
