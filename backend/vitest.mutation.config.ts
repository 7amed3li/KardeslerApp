import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/pricing.test.ts',
      'tests/domain-properties.test.ts',
      'tests/application-coverage.test.ts',
    ],
  },
});

