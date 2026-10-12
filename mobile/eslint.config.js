// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const globals = require('globals');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Same carve-outs as the web app's eslint.config.mjs: findings that
    // predate lint running in CI stay visible as warnings.
    rules: {
      'react/no-unescaped-entities': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    ignores: ['dist/*', '.expo/*'],
  },
]);
