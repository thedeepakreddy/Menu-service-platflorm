// Proves the built apps refuse to start with invalid configuration (P-107).
// Runs against the real build output (turbo builds dependencies first).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const SENTINEL = 'sk-live-THIS-MUST-NOT-LEAK';

function runApi(env: Record<string, string>) {
  return spawnSync(process.execPath, ['dist/main.js'], {
    cwd: `${repoRoot}apps/api`,
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf8',
    timeout: 20_000,
  });
}

function runNextStart(env: Record<string, string>) {
  return spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '0'], {
    cwd: `${repoRoot}apps/web`,
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf8',
    timeout: 30_000,
  });
}

describe('API refuses invalid configuration', () => {
  it('exits non-zero when all variables are missing', () => {
    const r = runApi({});
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('refusing to start');
    expect(r.stderr).toContain('APP_ENV is required');
    expect(r.stderr).toContain('API_HOST is required');
    expect(r.stderr).toContain('API_PORT is required');
  });

  it('exits non-zero on an invalid value without echoing it', () => {
    const r = runApi({ APP_ENV: SENTINEL, API_HOST: '127.0.0.1', API_PORT: '4000' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('APP_ENV is invalid');
    expect(r.stderr + r.stdout).not.toContain(SENTINEL);
  });

  it('exits non-zero on an out-of-range port', () => {
    const r = runApi({ APP_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: '70000' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('API_PORT is invalid');
  });
});

describe('API refuses unsafe security configuration (D-019, D-020)', () => {
  const base = { API_HOST: '127.0.0.1', API_PORT: '4000' };
  it.each([
    [
      'wildcard CORS origin',
      { APP_ENV: 'development', API_CORS_ALLOWED_ORIGINS: '*' },
      'API_CORS_ALLOWED_ORIGINS',
    ],
    [
      'http origin in production',
      { APP_ENV: 'production', API_CORS_ALLOWED_ORIGINS: 'http://a.example' },
      'API_CORS_ALLOWED_ORIGINS',
    ],
    [
      'debug logging in production',
      { APP_ENV: 'production', API_LOG_LEVEL: 'debug' },
      'API_LOG_LEVEL',
    ],
  ])('exits non-zero on %s', (_label, env, variable) => {
    const r = runApi({ ...base, ...env });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`${variable} is invalid`);
  });
});

describe('Web refuses invalid configuration', () => {
  it('`next start` fails when APP_ENV is missing', () => {
    const r = runNextStart({});
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toContain('APP_ENV is required');
  });

  it('`next start` fails on an invalid APP_ENV without echoing it', () => {
    const r = runNextStart({ APP_ENV: SENTINEL });
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toContain('APP_ENV is invalid');
    expect(r.stderr + r.stdout).not.toContain(SENTINEL);
  });
});
