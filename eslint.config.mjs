import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.cjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/shared/src/**/*.ts'],
    rules: {
      'max-lines': ['error', { max: 400 }],
    },
  },
  {
    files: ['backend/src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'domain', pattern: 'backend/src/domain/**' },
        { type: 'ports', pattern: 'backend/src/ports/**' },
        { type: 'application', pattern: 'backend/src/application/**' },
        { type: 'http', pattern: 'backend/src/http/**' },
        { type: 'infrastructure', pattern: 'backend/src/infrastructure/**' },
        { type: 'jobs', pattern: 'backend/src/jobs/**' },
        { type: 'config', pattern: 'backend/src/config/**' },
        { type: 'root', pattern: 'backend/src/*.ts' },
      ],
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'max-lines': ['error', { max: 400, skipBlankLines: false, skipComments: false }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: false, skipComments: false }],
      'boundaries/element-types': [
        'error',
        {
          default: 'allow',
          rules: [
            { from: 'domain', disallow: ['ports', 'application', 'http', 'infrastructure', 'jobs', 'config', 'root'] },
            { from: 'ports', disallow: ['application', 'http', 'infrastructure', 'jobs', 'config', 'root'] },
            { from: 'application', disallow: ['http', 'infrastructure', 'jobs', 'config', 'root'] },
            { from: 'http', disallow: ['infrastructure', 'jobs', 'root'] },
          ],
        },
      ],
    },
  },
);
