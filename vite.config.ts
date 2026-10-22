import { defineConfig } from 'vite-plus';
import type { OxlintOverride } from 'vite-plus/lint';

// One root config governs lint, format, type checks and the test projects for every workspace package.
const deny = (patterns: string[]): NonNullable<OxlintOverride['rules']> => ({
  'no-restricted-imports': ['error', { patterns }],
});

export default defineConfig({
  lint: {
    // The scope gate is a Node script that prints its verdict; it is a protected path, not application code.
    ignorePatterns: ['.claude/**'],
    plugins: ['typescript', 'import', 'unicorn'],
    options: { typeAware: true, typeCheck: true },
    rules: {
      'typescript/no-explicit-any': 'error',
      'typescript/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-nocheck': true, 'ts-expect-error': 'allow-with-description' },
      ],
      'typescript/no-non-null-assertion': 'error',
      'typescript/no-unsafe-type-assertion': 'error',
      'typescript/switch-exhaustiveness-check': 'error',
      'typescript/consistent-type-imports': 'error',
      'unicorn/no-abusive-eslint-disable': 'error',
      'import/no-cycle': 'error',
      'no-unused-vars': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
    overrides: [
      // Dependency direction (ARCHITECTURE section 1): web -> machine -> contract <- agent; eval -> agent + machine.
      {
        files: ['apps/web/**'],
        plugins: ['react', 'jsx-a11y'],
        env: { browser: true },
        rules: deny(['@pending/agent', '@pending/eval', '**/apps/agent/**', '**/eval/**']),
      },
      {
        files: ['apps/agent/**'],
        env: { node: true },
        rules: deny(['@pending/web', '@pending/eval', '**/apps/web/**', '**/eval/**']),
      },
      {
        files: ['packages/machine/**'],
        rules: deny(['@pending/web', '@pending/agent', '@pending/eval', '**/apps/**', '**/eval/**']),
      },
      {
        files: ['packages/contract/**'],
        rules: deny(['@pending/*', '**/apps/**', '**/packages/machine/**', '**/eval/**']),
      },
      { files: ['eval/**'], env: { node: true }, rules: deny(['@pending/web', '**/apps/web/**']) },
      { files: ['**/*.test.ts', '**/*.test.tsx'], plugins: ['vitest'] },
    ],
  },
  fmt: {
    semi: true,
    singleQuote: true,
    printWidth: 110,
    // The specifications and agent files are authored by hand in the planning pack and copied in unchanged.
    ignorePatterns: ['*.md', '.claude/**'],
  },
  test: { projects: ['apps/*', 'packages/*', 'eval'] },
});

// gate test: protected path
