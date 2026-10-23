// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

const SOURCE_FILES = ['**/*.{ts,tsx,js,jsx,mjs,cjs}'];

// Import restrictions: package, where it IS allowed, why. Flat config lets a later block replace
// an earlier block's options for the same rule, so each package is enforced by its own rule key
// and zones that overlap (e.g. src/test-utils/**) automatically get the union of their allowances.
const PDF_LIB = {
  name: '@cantoo/pdf-lib',
  allowed: ['src/services/pdf/**', 'scripts/**', '**/__tests__/**', 'src/test-utils/**'],
  message: 'Screens and components must use src/services/pdf/*, not pdf-lib directly.',
};
const FILE_SYSTEM = {
  name: 'expo-file-system',
  allowed: ['src/services/tools/toolFs.ts'],
  message: 'Tool file access goes through src/services/tools/toolFs.ts.',
};
// no-restricted-syntax zones: each package is allowed only where its zone lifts it. One rule key
// holds every entry, so a zone lists what it still restricts via restrictedSyntax(except).
const SORTABLES = {
  source: "'react-native-sortables'",
  message: 'react-native-sortables may only be used inside src/components.',
};
const ADS = {
  source: "'react-native-google-mobile-ads'",
  message: 'Ads go through src/services/ads/* and src/components/AdBanner.tsx.',
};
const FIREBASE = {
  source: '/^@react-native-firebase\\//',
  message: 'Firebase is used only by src/services/telemetry/firebaseTelemetry.ts.',
};
const FIREBASE_ADAPTER = {
  source: '/(^|\\/)firebaseTelemetry(\\.ts)?$/',
  message: 'Only src/services/telemetry/telemetry.ts loads the Firebase adapter (lazily).',
};
const RESTRICTED_MODULES = [SORTABLES, ADS, FIREBASE, FIREBASE_ADAPTER];

const importRule = ({ name, message }) => ['error', { paths: [{ name, message }] }];
// Every way a module can be pulled in: import, re-export, export-all, import(), require() and
// `import x = require()`.
const selectorsFor = ({ source, message }) =>
  [
    `ImportDeclaration[source.value=${source}]`,
    `ExportNamedDeclaration[source.value=${source}]`,
    `ExportAllDeclaration[source.value=${source}]`,
    `ImportExpression[source.value=${source}]`,
    `CallExpression[callee.name='require'][arguments.0.value=${source}]`,
    `TSExternalModuleReference[expression.value=${source}]`,
  ].map((selector) => ({ selector, message }));
const restrictedSyntax = (except) => [
  'error',
  ...RESTRICTED_MODULES.filter((m) => !except.includes(m)).flatMap(selectorsFor),
];

const restrictionBlocks = () => [
  {
    files: SOURCE_FILES,
    rules: {
      'no-restricted-imports': importRule(PDF_LIB),
      'no-restricted-syntax': restrictedSyntax([]),
    },
  },
  {
    // The @typescript-eslint plugin is only registered for TypeScript files.
    files: ['**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-restricted-imports': importRule(FILE_SYSTEM) },
  },
  { files: PDF_LIB.allowed, rules: { 'no-restricted-imports': 'off' } },
  { files: FILE_SYSTEM.allowed, rules: { '@typescript-eslint/no-restricted-imports': 'off' } },
  {
    files: ['src/components/**'],
    rules: { 'no-restricted-syntax': restrictedSyntax([SORTABLES]) },
  },
  {
    files: ['src/components/AdBanner.tsx'],
    rules: { 'no-restricted-syntax': restrictedSyntax([SORTABLES, ADS]) },
  },
  { files: ['src/services/ads/**'], rules: { 'no-restricted-syntax': restrictedSyntax([ADS]) } },
  {
    files: ['src/services/telemetry/firebaseTelemetry.ts'],
    rules: { 'no-restricted-syntax': restrictedSyntax([FIREBASE]) },
  },
  {
    files: ['src/services/telemetry/telemetry.ts'],
    rules: { 'no-restricted-syntax': restrictedSyntax([FIREBASE_ADAPTER]) },
  },
  // Tests and their setup mock these packages.
  {
    files: ['**/__tests__/**', 'src/test-utils/**', 'jest.setup.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },
];

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    files: ['jest.setup.js'],
    languageOptions: { globals: { jest: 'readonly' } },
  },
  {
    // CommonJS config read by Node (app.config.ts, autolinking).
    files: ['firebaseConfig.js', 'react-native.config.js'],
    languageOptions: { globals: { __dirname: 'readonly' } },
  },
  ...restrictionBlocks(),
  {
    ignores: ['dist/*', 'android/*', '.expo/*', 'src/db/migrations/*'],
  },
]);
