/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  plugins: [import.meta.resolve('@stryker-mutator/vitest-runner')],
  testRunner: 'vitest',
  mutate: [
    'src/domain/pricing/pricing.domain.ts',
    'src/domain/coupons/coupon.domain.ts',
  ],
  vitest: {
    configFile: 'vitest.mutation.config.ts',
    dir: '.',
  },
  reporters: ['clear-text', 'progress'],
  coverageAnalysis: 'perTest',
  concurrency: 4,
};

