import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

const sharedRules = {
  'no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      ignoreRestSiblings: true,
    },
  ],
};

export default [
  js.configs.recommended,
  {
    ignores: [
      '**/node_modules/**/*',
      '**/dist/**/*',
      '**/build/**/*',
      '**/.vite/**/*',
      'tmp/**/*',
      'packages/app/public/data/**/*',
    ],
  },
  {
    files: ['packages/app/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...sharedRules,
      'no-console': 'off',
    },
  },
  {
    files: ['packages/server/src/**/*.js', 'packages/*/scripts/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...sharedRules,
      'no-console': 'off',
    },
  },
  eslintConfigPrettier,
];
