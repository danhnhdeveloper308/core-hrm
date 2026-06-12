// ESLint flat config dùng chung cho packages/shared + apps/api.
// apps/web có config riêng (eslint-config-next) tại apps/web/eslint.config.mjs.
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      'apps/web/**', // web tự lint bằng eslint-config-next
      'apps/api/src/generated/**', // Prisma client generated
      '**/*.config.{js,mjs,cjs}',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // NestJS DI dùng class làm token — cho phép empty constructor body
      'no-useless-constructor': 'off',
      '@typescript-eslint/no-useless-constructor': 'off',
    },
  },
  {
    // KHÔNG bật consistent-type-imports cho api: NestJS DI cần runtime import
    // cho constructor param types (emitDecoratorMetadata)
    files: ['packages/shared/src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { fixStyle: 'inline-type-imports' },
      ],
    },
  },
);
