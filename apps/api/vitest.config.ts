import { defineConfig } from 'vitest/config';

/**
 * Two projects:
 * - `unit` (default `pnpm test`): no external services.
 * - `db` (`pnpm test:db`): real PostgreSQL (Doc 05 §9: isolation tests must exercise real
 *   boundaries). Requires TEST_DATABASE_ADMIN_URL; it fails, never skips, without it.
 */
export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.db.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: ['src/**/*.db.test.ts'],
          globalSetup: ['./test/db/global-setup.ts'],
          // One shared database; run files one at a time.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
