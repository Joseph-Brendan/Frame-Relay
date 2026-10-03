import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.mjs', '**/scripts/**/*.{ts,js}', '**/*.test.ts'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  {
    files: ['packages/converter/src/**/*.{ts,js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'fs', message: 'Pure converter functions must not use fs.' },
            { name: 'node:fs', message: 'Pure converter functions must not use fs.' },
            { name: 'node:fs/promises', message: 'Pure converter functions must not use fs.' },
            { name: 'path', message: 'Pure converter functions must not use path.' },
            { name: 'node:path', message: 'Pure converter functions must not use path.' },
            {
              name: '@figma/plugin-typings',
              message: 'Converter must only use plain snapshot objects, not Figma typings.',
            },
          ],
          patterns: [
            {
              group: ['*figma*'],
              message: 'Converter must not import Figma API.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'figma', message: 'figma global is not allowed in pure converter logic.' },
      ],
    },
  },
  {
    files: [
      'packages/plugin/src/ui/**/*.{ts,tsx,js,jsx}',
      'packages/plugin/src/shared/**/*.{ts,js}',
      'packages/plugin/scripts/**/*.{ts,js}',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'figma',
          message: 'figma global is only allowed inside packages/plugin/src/main/.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@figma/plugin-typings',
              message: 'Figma typings are only allowed inside packages/plugin/src/main/.',
            },
          ],
        },
      ],
    },
  },
);
