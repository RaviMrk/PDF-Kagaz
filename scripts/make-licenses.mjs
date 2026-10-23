// Writes src/config/licenses.json (list) and src/config/licenseTexts.json (texts, deduplicated).
// Source of truth is package-lock.json, so the output does not depend on the host OS or on which
// optional packages happen to be installed. Run: npm run licenses
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (f) => path.join(root, 'src/config', f);

// Packages Expo and React Native pull in for building, bundling or testing only. They never reach
// the APK, so they are not attributed. In-repo module and dev flags are handled separately.
const TOOLING = [
  '@expo/cli',
  '@babel/',
  '@jest/',
  '@types/',
  '@eslint',
  '@firebase/', // web SDK; the app uses the native Firebase SDKs
  '@react-native/babel-',
  '@react-native/codegen',
  '@react-native/community-cli-plugin',
  '@react-native/debugger-',
  '@react-native/dev-middleware',
  '@react-native/gradle-plugin',
  '@react-native/metro-',
  'babel-plugin-',
  'bplist-parser',
  'eslint',
  'fb-dotslash',
  'firebase',
  'hermes-compiler',
  'jest',
  'jimp-compact',
  'lightningcss',
  'metro',
  'ob1',
  'pdf-native', // in-repo
  'react-devtools-core',
  'typescript',
];
// A trailing "/" or "-" means prefix; anything else is an exact name (or a name followed by "-").
const isTooling = (name) =>
  TOOLING.some((p) =>
    /[/-]$/.test(p) ? name.startsWith(p) : name === p || name.startsWith(`${p}-`),
  );

const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const found = new Map();
for (const [key, node] of Object.entries(lock.packages)) {
  if (key === '' || node.dev || node.devOptional || node.link) continue;
  const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
  if (isTooling(name)) continue;
  found.set(`${name}@${node.version}`, {
    name,
    version: node.version,
    license: node.license,
    dir: key,
  });
}

const SPDX_DIR = path.join(root, 'scripts/spdx');
const NAMES = /^(licen[sc]e|licen[sc]e[-.].*|copying.*|unlicense)$/i;
function textOf(entry) {
  const dir = path.join(root, entry.dir);
  const file = fs
    .readdirSync(dir)
    .filter(
      (f) => NAMES.test(f.replace(/\.(md|txt)$/i, '')) && fs.statSync(path.join(dir, f)).isFile(),
    )
    .sort()[0];
  if (file) return fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n').trim();
  const spdx = path.join(SPDX_DIR, `${entry.license}.txt`);
  if (fs.existsSync(spdx)) return fs.readFileSync(spdx, 'utf8').replace(/\r\n/g, '\n').trim();
  return null;
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const texts = {};
const list = [];
const problems = [];
for (const e of [...found.values()].sort(
  (a, b) => cmp(a.name, b.name) || cmp(a.version, b.version),
)) {
  if (!e.license) {
    problems.push(`${e.name}@${e.version}: no licence in package-lock.json`);
    continue;
  }
  const text = textOf(e);
  if (!text) {
    problems.push(`${e.name}@${e.version}: no licence file and no scripts/spdx/${e.license}.txt`);
    continue;
  }
  const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
  texts[hash] = text;
  list.push({ name: e.name, version: e.version, license: e.license, text: hash });
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
const sortedTexts = Object.fromEntries(Object.entries(texts).sort(([a], [b]) => cmp(a, b)));
fs.writeFileSync(out('licenses.json'), `${JSON.stringify(list, null, 2)}\n`);
fs.writeFileSync(out('licenseTexts.json'), `${JSON.stringify(sortedTexts)}\n`);
console.log(`Wrote ${list.length} licences, ${Object.keys(sortedTexts).length} distinct texts`);
