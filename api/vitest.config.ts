import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts'],
      exclude: ['src/domain/**/*.test.ts'],
      thresholds: {
        // domain/ and state machines = 100% (CLAUDE.md invariant 1)
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
