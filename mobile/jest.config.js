/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.{ts,tsx}'],
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm|((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|lucide-react-native|openapi-fetch|@tanstack/react-query|zustand))',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/api/**/*.{ts,tsx}',
    'src/lib/**/*.{ts,tsx}',
    'src/features/**/model/**/*.{ts,tsx}',
    '!src/api/generated/**',
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 85,
      branches: 80,
    },
  },
};

