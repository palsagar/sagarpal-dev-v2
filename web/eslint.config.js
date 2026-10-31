// @ts-check
import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      'dist/',
      '.astro/',
      'node_modules/',
      'test-results/',
      'playwright-report/',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
);
