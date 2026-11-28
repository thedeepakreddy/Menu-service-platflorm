import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig, devices } from '@playwright/test';

const API_PORT = '4100';
const WEB_PORT = '3100';
const OIDC_PORT = '39443';
// `localhost`: Chromium stores Secure (`__Host-`) cookies over http only for localhost.
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
const E2E_OIDC_ISSUER = `https://127.0.0.1:${OIDC_PORT}`;
/** The test provider's throwaway certificate, trusted by the API and web via NODE_EXTRA_CA_CERTS. */
const OIDC_CERT = join(tmpdir(), 'platform-e2e-oidc-cert.pem');
// Synthetic, test-only values (never secrets): the BFF credential shared by web and API, and the
// login-transaction key (32 bytes, base64url).
const E2E_BFF_CREDENTIAL = 'synthetic-e2e-bff-credential-not-a-secret-0001';
const E2E_SESSION_SECRET = Buffer.alloc(32, 7).toString('base64url');
// The main process removes a stale certificate so the servers wait for the fresh one.
if (process.env.TEST_WORKER_INDEX === undefined && existsSync(OIDC_CERT)) unlinkSync(OIDC_CERT);
const waitForCert = (command: string) =>
  `sh -c 'until [ -f "${OIDC_CERT}" ]; do sleep 0.2; done; exec ${command}'`;

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
    baseURL: WEB_ORIGIN,
    trace: 'off',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      // Strict local OIDC provider over TLS (apps/web/test/oidc-provider.ts), for the login test.
      command: `node apps/web/test/oidc-provider-cli.mjs ${OIDC_PORT} ${OIDC_CERT} ${WEB_ORIGIN}`,
      cwd: '../..',
      url: `${E2E_OIDC_ISSUER}/.well-known/openid-configuration`,
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: waitForCert('pnpm --filter @platform/api start'),
      url: `http://127.0.0.1:${API_PORT}/health`,
      env: {
        APP_ENV: 'test',
        API_HOST: '127.0.0.1',
        API_PORT,
        API_DATABASE_URL,
        NODE_EXTRA_CA_CERTS: OIDC_CERT,
        API_OWNER_OIDC_ISSUER: E2E_OIDC_ISSUER,
        API_OWNER_OIDC_AUDIENCE: 'platform-api',
        API_OWNER_OIDC_JWKS_URL: `${E2E_OIDC_ISSUER}/keys`,
        API_OWNER_OIDC_CLIENT_ID: 'owner-web',
        API_BFF_CREDENTIAL: E2E_BFF_CREDENTIAL,
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: waitForCert(`pnpm --filter @platform/web start -p ${WEB_PORT} -H 127.0.0.1`),
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: {
        APP_ENV: 'test',
        NODE_EXTRA_CA_CERTS: OIDC_CERT,
        WEB_PUBLIC_ORIGIN: WEB_ORIGIN,
        WEB_SESSION_SECRET: E2E_SESSION_SECRET,
        WEB_API_ORIGIN: `http://127.0.0.1:${API_PORT}`,
        WEB_API_BFF_CREDENTIAL: E2E_BFF_CREDENTIAL,
        // One trusted proxy in front, as in staging/production; tests send its X-Forwarded-For
        // entry (fixtures.ts), so each test is its own visitor at the API's per-visitor limits.
        WEB_TRUSTED_PROXY_HOPS: '1',
        WEB_OWNER_OIDC_ISSUER: E2E_OIDC_ISSUER,
        WEB_OWNER_OIDC_CLIENT_ID: 'owner-web',
        WEB_OWNER_OIDC_CLIENT_SECRET: 'synthetic-e2e-client-secret',
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
