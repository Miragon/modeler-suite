// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * The DOM boundary (P1): schema-model and dsl run in Node, workers and the VS Code extension host,
 * so they never reach diagram-js, a DOM library or the DOM, and take only types from the contract.
 * Renderers never import the shell; only the apps (and e2e) mount it. dependency-cruiser enforces
 * the same edges on the module graph (.dependency-cruiser.cjs).
 */
const DOM_FREE_RESTRICTED_IMPORTS = {
  paths: [
    { name: 'diagram-js', message: 'DOM-free packages must not import diagram-js (P1).' },
    { name: 'tiny-svg', message: 'DOM-free packages must not import tiny-svg (P1).' },
    { name: 'min-dom', message: 'DOM-free packages must not import min-dom (P1).' },
    { name: '@miragon/modeler-shell', message: 'Only the apps mount the shell.' },
    {
      name: '@miragon/modeler-api',
      allowTypeImports: true,
      message: 'DOM-free packages take only types from the contract.',
    },
  ],
  patterns: [
    { group: ['diagram-js/*'], message: 'DOM-free packages must not import diagram-js (P1).' },
    { group: ['@miragon/modeler-shell/*'], message: 'Only the apps mount the shell.' },
    {
      group: ['@miragon/modeler-api/*'],
      allowTypeImports: true,
      message: 'DOM-free packages take only types from the contract.',
    },
  ],
};

const SHELL_RESTRICTED_IMPORTS = {
  paths: [{ name: '@miragon/modeler-shell', message: 'Renderers never import the shell.' }],
  patterns: [{ group: ['@miragon/modeler-shell/*'], message: 'Renderers never import the shell.' }],
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      'eslint.config.js',
      '**/*.config.{js,ts,mjs,cjs}',
      '.dependency-cruiser.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } } },
  {
    files: ['**/*.ts'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  {
    files: ['apps/*/scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['packages/renderer/**/*.ts', 'apps/**/*.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['packages/renderer/src/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', SHELL_RESTRICTED_IMPORTS] },
  },
  {
    files: ['packages/schema-model/**/*.ts', 'packages/dsl/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-restricted-imports': ['error', DOM_FREE_RESTRICTED_IMPORTS],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'DOM-free package: no window (P1).' },
        { name: 'document', message: 'DOM-free package: no document (P1).' },
      ],
    },
  },
  {
    files: ['**/*.{test,spec}.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
