import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // The engine is the pure, deterministic rules core: no DOM, no renderer, no wall clock, no Math.random.
    files: ['src/engine/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'The engine must not import the renderer.' },
            { group: ['**/render/**', '**/ui/**'], message: 'The engine must not import UI code.' },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG so games replay.' },
        { object: 'Date', property: 'now', message: 'The engine has no wall clock.' },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'performance'],
    },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
