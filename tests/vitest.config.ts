import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['architecture/**/*.test.ts', 'startup/**/*.test.ts', 'policy/**/*.test.ts'],
    exclude: ['architecture/fixtures/**'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
