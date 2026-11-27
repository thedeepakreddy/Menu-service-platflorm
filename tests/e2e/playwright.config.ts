import { defineConfig, devices } from '@playwright/test';

const API_PORT = '4100';
const WEB_PORT = '3100';

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
      env: { APP_ENV: 'test', API_HOST: '127.0.0.1', API_PORT },
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
