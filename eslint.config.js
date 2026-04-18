import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    '**/*.tmp.js',      // scratch files (treatment-standard.tmp.js etc.)
    'replicated/**',    // original ProClinic scraper artifacts
    'broker-extension/**',
    'cookie-relay/**',
  ]),
  {
    // Node-context configs — provide process/require globals.
    files: ['vite.config.js', 'eslint.config.js', 'knip.json', 'playwright.config.{js,ts}', 'functions/**/*.js', 'api/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // jsx-a11y: keep recommended set as warnings — upgrade to errors gradually.
      'jsx-a11y/anchor-is-valid': 'warn',
      'jsx-a11y/click-events-have-key-events': 'off', // too noisy for click-expand divs
      'jsx-a11y/no-static-element-interactions': 'off', // custom interactive cards
      'jsx-a11y/label-has-associated-control': 'off', // our forms use implicit labels extensively
    },
  },
])
