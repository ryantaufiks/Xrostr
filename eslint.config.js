import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const frameworkImports = ['@nestjs/*', 'drizzle-orm', 'drizzle-orm/*', 'pg', '@xrostr/db'];
const outerLayers = ['**/infrastructure/**', '**/interface/**'];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.next/**',
      '**/next-env.d.ts',
      'packages/db/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      // Keeps consistent-type-imports from turning DI constructor imports into type-only ones.
      parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Clean architecture: domain is pure TypeScript.
    files: ['apps/*/src/modules/*/domain/**/*.ts', 'apps/*/src/shared/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: frameworkImports,
              message: 'Domain must not depend on frameworks or the database.',
            },
            {
              group: [...outerLayers, '**/application/**'],
              message: 'Domain must not import outer layers.',
            },
          ],
        },
      ],
    },
  },
  {
    // Application depends on ports, never on adapters.
    files: ['apps/*/src/modules/*/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['drizzle-orm', 'drizzle-orm/*', 'pg', '@xrostr/db'],
              message: 'Use a port; adapters live in infrastructure.',
            },
            {
              group: outerLayers,
              message: 'Application must not import infrastructure or interface.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
