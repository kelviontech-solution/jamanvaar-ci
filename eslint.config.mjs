// Root ESLint config for the whole monorepo (apps/, packages/, cloud/). Deliberately NOT
// type-aware (no `project:` parserOptions) -- this repo has a dozen+ independent tsconfigs,
// and wiring type-aware linting across all of them correctly is a separate, larger effort.
// This catches the syntax-level issues (unused vars, hook dependency mistakes, obvious bugs)
// that matter most day to day, without the setup risk or slow analysis of a full type-aware pass.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/target/**',
      '**/src-tauri/target/**',
      '**/.vite/**',
      '**/coverage/**',
      '**/*.min.js',
      'cloud/api/prisma/generated/**',
      'packages/database/src/live_db.json',
      '**/*.json'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Only the two long-established, universally-accepted hooks rules. The plugin's v7
      // "recommended" set is tuned for codebases opting into the React Compiler (immutability,
      // purity, set-state-in-render, etc.) and flags this codebase's own deliberate patterns
      // (e.g. useDialogFocus.ts's documented "read a ref at event time" idiom) as errors.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // This codebase's house style deliberately uses `_prefixed` params/locals for
      // "required by the signature but unused here" -- flag everything else.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-unused-vars': 'off'
    }
  }
);
