// ESLint flat config for the whole monorepo.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'data/**', 'coverage/**', 'docs/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  {
    // The simulation must be deterministic: same inputs -> same state on client and server.
    files: ['packages/shared/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in world state.' },
        { object: 'Date', property: 'now', message: 'The sim has no wall clock; use ticks.' },
        { object: 'performance', property: 'now', message: 'The sim has no wall clock.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'shared must not use browser APIs.' },
        { name: 'document', message: 'shared must not use browser APIs.' },
        { name: 'process', message: 'shared must not use Node APIs.' },
      ],
    },
  },
);
