import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.cjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'max-lines': ['error', { max: 400, skipBlankLines: false, skipComments: false }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: ['src/domain/**/*.ts', 'src/application/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: 'process.env is strictly forbidden in src/domain and src/application. Pass configuration through ports or parameters.',
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'crypto', message: 'crypto must not be imported in application/. Cryptographic functions belong in infrastructure/security via ports.' },
            { name: 'node:crypto', message: 'node:crypto must not be imported in application/. Cryptographic functions belong in infrastructure/security via ports.' },
          ],
        },
      ],
    },
  },
);
