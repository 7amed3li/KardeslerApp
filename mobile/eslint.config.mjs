import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'src/api/generated/**',
      'babel.config.js',
      'jest.config.js',
      'metro.config.js',
      'scripts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      boundaries,
    },
    settings: {
      'boundaries/include': ['app/**/*', 'src/**/*'],
      'boundaries/elements': [
        { type: 'app', pattern: 'app/**' },
        { type: 'feature-model', pattern: 'src/features/*/model/**' },
        { type: 'feature-ui', pattern: 'src/features/*/ui/**' },
        { type: 'feature-api', pattern: 'src/features/*/api/**' },
        { type: 'api', pattern: 'src/api/**' },
        { type: 'secure-storage', pattern: 'src/lib/secure-storage/**' },
        { type: 'lib', pattern: 'src/lib/**' },
        { type: 'ui', pattern: 'src/ui/**' },
        { type: 'i18n', pattern: 'src/i18n/**' },
        { type: 'config', pattern: 'src/config/**' },
      ],
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'boundaries/element-types': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: 'feature-model',
              disallow: ['app', 'api', 'feature-api', 'feature-ui', 'ui', 'secure-storage'],
              message: 'model/ must stay pure TypeScript with no UI, API, or storage imports',
            },
            {
              from: ['app', 'feature-ui', 'ui', 'lib', 'i18n'],
              disallow: ['secure-storage'],
              message: 'Only src/api or auth session manager should use secure-storage',
            },
          ],
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'expo-secure-store',
              message: 'Import expo-secure-store only inside src/lib/secure-storage/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/lib/secure-storage/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['src/features/*/model/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'model/ must be pure TypeScript without React.' },
            { name: 'react-native', message: 'model/ must be pure TypeScript without React Native.' },
            { name: 'expo-secure-store', message: 'model/ cannot import expo-secure-store.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/ui/assets/**/*.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);

