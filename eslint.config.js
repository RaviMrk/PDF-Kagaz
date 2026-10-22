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
const SORTABLES = {
  name: 'react-native-sortables',
  allowed: ['src/components/**'],
  message: 'react-native-sortables may only be used inside src/components.',
};

const importRule = ({ name, message }) => ['error', { paths: [{ name, message }] }];
// Every way a module can be pulled in: import, re-export, export-all, import(), require() and
// `import x = require()`.
const syntaxRule = ({ name, message }) => [
  'error',
  ...[
    `ImportDeclaration[source.value='${name}']`,
    `ExportNamedDeclaration[source.value='${name}']`,
    `ExportAllDeclaration[source.value='${name}']`,
    `ImportExpression[source.value='${name}']`,
    `CallExpression[callee.name='require'][arguments.0.value='${name}']`,
    `TSExternalModuleReference[expression.value='${name}']`,
  ].map((selector) => ({ selector, message })),
];

const restrictionBlocks = () => [
  {
    files: SOURCE_FILES,
    rules: {
      'no-restricted-imports': importRule(PDF_LIB),
      'no-restricted-syntax': syntaxRule(SORTABLES),
    },
  },
  {
    // The @typescript-eslint plugin is only registered for TypeScript files.
    files: ['**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-restricted-imports': importRule(FILE_SYSTEM) },
  },
  { files: PDF_LIB.allowed, rules: { 'no-restricted-imports': 'off' } },
  { files: FILE_SYSTEM.allowed, rules: { '@typescript-eslint/no-restricted-imports': 'off' } },
  { files: SORTABLES.allowed, rules: { 'no-restricted-syntax': 'off' } },
];

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    files: ['jest.setup.js'],
    languageOptions: { globals: { jest: 'readonly' } },
  },
  ...restrictionBlocks(),
  {
    ignores: ['dist/*', 'android/*', '.expo/*', 'src/db/migrations/*'],
  },
]);
