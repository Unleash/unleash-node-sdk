import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

// Patch minimatch so both eslint-plugin-import (expects v3 default export)
// and test-exclude (expects `minimatch` named export) can coexist.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const mm = require('minimatch');
  if (typeof mm === 'function' && !mm.minimatch) {
    // eslint-disable-next-line no-param-reassign
    mm.minimatch = mm;
  }
} catch {
  // ignore if minimatch is unavailable
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov'],
    },
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
  resolve: {
    alias: {
      ava: resolve(__dirname, './src/test/ava-shim.ts'),
    },
  },
});
