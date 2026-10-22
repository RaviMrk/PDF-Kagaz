// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

const SOURCE_FILES = ['**/*.{ts,tsx,js,jsx,mjs,cjs}'];

// Import restrictions: [package, where it IS allowed, why]. Flat config lets a later block replace
// an earlier block's `no-restricted-imports`, so each allowed zone restates the other restrictions.
const RESTRICTIONS = [
  {
    name: '@cantoo/pdf-lib',
    allowed: ['src/services/pdf/**', 'scripts/**', '**/__tests__/**', 'src/test-utils/**'],
    message: 'Screens and components must use src/services/pdf/*, not pdf-lib directly.',
  },
  {
    name: 'expo-file-system',
    allowed: ['src/services/tools/toolFs.ts'],
    message: 'Tool file access goes through src/services/tools/toolFs.ts.',
  },
  {
    name: 'react-native-sortables',
    allowed: ['src/components/**', 'src/test-utils/**'],
    message: 'react-native-sortables may only be used inside src/components.',
  },
];

const rule = (restricted) => ({
  'no-restricted-imports': [
    'error',
    { paths: restricted.map(({ name, message }) => ({ name, message })) },
  ],
});

function restrictionBlocks() {
  return [
    { files: SOURCE_FILES, rules: rule(RESTRICTIONS) },
    ...RESTRICTIONS.map((allowedHere) => ({
      files: allowedHere.allowed,
      rules: rule(RESTRICTIONS.filter((r) => r !== allowedHere)),
    })),
  ];
}

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
