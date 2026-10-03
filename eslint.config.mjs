// Lint for bugs, not style: recommended sets plus a few rules that catch real
// mistakes. No formatting rules — this repo has no Prettier and none is wanted.
import { readFileSync } from 'node:fs';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// The EXPO_PUBLIC_* names the app may read are declared once, in mobile/src/env.d.ts.
// The lint rule below reads them from there, so adding a name there is the only step.
const declaredPublicEnv = [
  ...readFileSync(new URL('./mobile/src/env.d.ts', import.meta.url), 'utf8').matchAll(/^\s+(EXPO_PUBLIC_[A-Z0-9_]+)\??:/gmu),
].map((match) => match[1]);

export default defineConfig(
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'Frontend/**', 'mobile/.expo/**', 'mobile/ios/**', 'mobile/android/**'],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // Each file is checked against the tsconfig that owns it (mobile/ or backend/).
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      // A promise nobody awaits fails silently. `void` marks a deliberate fire-and-forget.
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
    },
  },

  // The mobile app: hooks rules, and no stray console output.
  {
    files: ['mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser, __DEV__: 'readonly' } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // warn/error are used on purpose (the store's migration warning); log/info/debug are leftovers.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // Expo inlines `process.env.EXPO_PUBLIC_NAME` at build time by rewriting that exact static
  // read (babel-preset-expo, plugins/inline-env-vars.js). Any other shape reads nothing in a
  // release bundle, and a misspelled name just reads undefined, so both are errors.
  // Node-side files (tests, app.config.js) are exempt: they run under Node, not Metro.
  {
    files: ['mobile/**/*.{ts,tsx}'],
    ignores: ['mobile/**/*.test.{ts,tsx}', 'mobile/**/*.d.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `MemberExpression[computed=false][object.type='MemberExpression'][object.object.name='process'][object.property.name='env'][property.name=/^EXPO_PUBLIC_/]:not([property.name=/^(${declaredPublicEnv.join('|')})$/])`,
          message: 'Unknown EXPO_PUBLIC_ variable. Declare it in mobile/src/env.d.ts (and .env.example), or fix the spelling.',
        },
        {
          // `process.env` itself used as a value: destructured, aliased, passed on or spread.
          // Only `process.env.NAME` (process.env as the object of a further member read) is rewritten.
          selector: "MemberExpression[computed=false][object.name='process'][property.name='env']:not(MemberExpression > MemberExpression.object)",
          message: 'Expo only inlines the static read process.env.EXPO_PUBLIC_NAME. Destructuring or aliasing process.env reads nothing in a release build; read each variable directly.',
        },
        {
          selector: "MemberExpression[computed=true][object.type='MemberExpression'][object.object.name='process'][object.property.name='env']",
          message: "Expo only inlines static reads. Use process.env.EXPO_PUBLIC_NAME, not process.env[...]; a computed read is undefined in a release build.",
        },
      ],
    },
  },

  // Tests may log, and use whatever they need to set up a case.
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: { 'no-console': 'off' },
  },

  // Tests and mock implementations are async because the interface they stand in
  // for is; they have nothing to await. Real app and backend source keeps the rule.
  {
    files: ['**/*.test.{ts,tsx}', '**/mock*.ts', '**/*Mock*.ts'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },

  // Node code: the backend and its scripts.
  {
    files: ['backend/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // Files outside any tsconfig (backend tests and scripts, mobile JS config):
  // linted, but without the rules that need type information.
  {
    files: ['backend/src/**/*.test.ts', 'backend/scripts/**/*.ts', 'mobile/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['mobile/*.js'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
