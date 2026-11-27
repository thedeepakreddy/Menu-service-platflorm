import { defineConfig, devices } from '@playwright/test';

const API_PORT = '4100';
const WEB_PORT = '3100';

// The API refuses to start without a safe runtime database role (D-028). CI provisions a
// throwaway database and exports this (apps/api/test/db/provision-cli.ts). Never skipped.
const API_DATABASE_URL = process.env.E2E_API_DATABASE_URL;
if (API_DATABASE_URL === undefined || API_DATABASE_URL === '') {
  throw new Error(
    'E2E_API_DATABASE_URL is required for the e2e tests (see apps/api/test/db/provision-cli.ts)',
  );
}

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'off',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @platform/api start',
      url: `http://127.0.0.1:${API_PORT}/health`,
      env: { APP_ENV: 'test', API_HOST: '127.0.0.1', API_PORT, API_DATABASE_URL },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @platform/web start -p ${WEB_PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { APP_ENV: 'test' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
