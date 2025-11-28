import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: [['lcov', { projectRoot: 'src' }], ['json'], ['json-summary']],
    },
    pool: 'threads',
  },
});
