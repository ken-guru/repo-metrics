const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  // Apply to TypeScript files
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        project: './tsconfig.eslint.json',
        warnOnUnsupportedTypeScriptVersion: false,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    // Merge recommended rules and the "requiring-type-checking" ruleset
    rules: Object.assign({}, tsPlugin.configs.recommended.rules, tsPlugin.configs["recommended-requiring-type-checking"].rules, {
      // keep a few previous exceptions
      'no-empty': 'off',
      'no-useless-escape': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    }),
  },
  // Overrides for tests
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
];
