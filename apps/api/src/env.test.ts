import { describe, expect, it } from 'vitest';

import { parseApiEnv } from './env.js';

// Synthetic connection string; sslmode=require so production-like cases are valid too.
const DB_URL = 'postgres://app_runtime:synthetic@db.internal:5432/platform?sslmode=require';
const valid = {
  APP_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: '4000',
  API_DATABASE_URL: DB_URL,
};

describe('parseApiEnv', () => {
  it('accepts a complete, valid configuration and coerces the port', () => {
    expect(parseApiEnv(valid)).toEqual({
      ok: true,
      env: {
        APP_ENV: 'test',
        API_HOST: '127.0.0.1',
        API_PORT: 4000,
        // Optional variables take their documented secure defaults (D-019, D-020).
        API_CORS_ALLOWED_ORIGINS: [],
        API_LOG_LEVEL: 'info',
        API_DATABASE_URL: DB_URL,
        API_DATABASE_POOL_MAX: 10,
      },
    });
  });

  it('reports every missing variable as required', () => {
    const result = parseApiEnv({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { variable: 'APP_ENV', problem: 'is required' },
        { variable: 'API_HOST', problem: 'is required' },
        { variable: 'API_PORT', problem: 'is required' },
        { variable: 'API_DATABASE_URL', problem: 'is required' },
      ]),
    );
  });

  it.each([
    ['APP_ENV', 'prod'],
    ['API_HOST', '   '],
    ['API_PORT', '0'],
    ['API_PORT', '65536'],
    ['API_PORT', '40.5'],
    ['API_PORT', 'not-a-port'],
  ])('rejects %s=%j', (variable, value) => {
    const result = parseApiEnv({ ...valid, [variable]: value });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.variable)).toEqual([variable]);
  });

  it('never echoes the supplied value in issues', () => {
    const secretLooking = 'sk-live-THIS-MUST-NOT-LEAK';
    const result = parseApiEnv({ ...valid, APP_ENV: secretLooking, API_PORT: secretLooking });
    expect(JSON.stringify(result)).not.toContain(secretLooking);
  });

  describe('API_CORS_ALLOWED_ORIGINS (D-019)', () => {
    const withOrigins = (value: string, appEnv = 'development') =>
      parseApiEnv({ ...valid, APP_ENV: appEnv, API_CORS_ALLOWED_ORIGINS: value });

    it('parses a comma-separated list of exact origins', () => {
      const result = withOrigins(' https://a.example , http://localhost:3000 ');
      expect(result.ok && result.env.API_CORS_ALLOWED_ORIGINS).toEqual([
        'https://a.example',
        'http://localhost:3000',
      ]);
    });

    it('treats an empty value as no cross-origin access', () => {
      const result = withOrigins('');
      expect(result.ok && result.env.API_CORS_ALLOWED_ORIGINS).toEqual([]);
    });

    it.each([
      ['wildcard', '*'],
      ['wildcard subdomain', 'https://*.example.com'],
      ['null origin', 'null'],
      ['path', 'https://a.example/app'],
      ['trailing slash', 'https://a.example/'],
      ['credentials', 'https://user:pass@a.example'],
      ['non-http scheme', 'ftp://a.example'],
      ['not a URL', 'a.example'],
      ['one bad entry among good', 'https://a.example,*'],
    ])('rejects %s', (_label, value) => {
      const result = withOrigins(value);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues.map((i) => i.variable)).toEqual(['API_CORS_ALLOWED_ORIGINS']);
      // Issues name the variable only; supplied values (e.g. credentials) are never echoed.
      expect(JSON.stringify(result)).not.toContain('user:pass');
    });

    it.each(['staging', 'production'])('requires https origins in %s', (appEnv) => {
      expect(withOrigins('http://a.example', appEnv).ok).toBe(false);
      expect(withOrigins('https://a.example', appEnv).ok).toBe(true);
    });
  });

  describe('API_LOG_LEVEL (D-020)', () => {
    it.each(['error', 'warn', 'info', 'debug'])('accepts %s outside production', (level) => {
      expect(parseApiEnv({ ...valid, API_LOG_LEVEL: level }).ok).toBe(true);
    });

    it('rejects unknown levels', () => {
      expect(parseApiEnv({ ...valid, API_LOG_LEVEL: 'trace' }).ok).toBe(false);
    });

    it.each(['staging', 'production'])('rejects debug in %s', (appEnv) => {
      const result = parseApiEnv({ ...valid, APP_ENV: appEnv, API_LOG_LEVEL: 'debug' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues.map((i) => i.variable)).toEqual(['API_LOG_LEVEL']);
    });
  });
});

describe('database configuration (D-028, D-029)', () => {
  it.each(['mysql://u:p@h/db', 'not a url', 'postgres://', 'https://db.example'])(
    'rejects a non-postgres URL without echoing it: %s',
    (value) => {
      const result = parseApiEnv({ ...valid, API_DATABASE_URL: value });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues).toEqual([
        { variable: 'API_DATABASE_URL', problem: 'is invalid (custom)' },
      ]);
      expect(JSON.stringify(result)).not.toContain(value === 'postgres://' ? 'postgres://' : value);
    },
  );

  it.each(['staging', 'production'])('requires TLS to the database in %s', (appEnv) => {
    const plain = 'postgres://app_runtime:synthetic@db.internal:5432/platform';
    for (const url of [plain, `${plain}?sslmode=disable`, `${plain}?sslmode=prefer`]) {
      const result = parseApiEnv({ ...valid, APP_ENV: appEnv, API_DATABASE_URL: url });
      expect(result.ok).toBe(false);
    }
    for (const mode of ['require', 'verify-ca', 'verify-full']) {
      const url = `${plain}?sslmode=${mode}`;
      expect(parseApiEnv({ ...valid, APP_ENV: appEnv, API_DATABASE_URL: url }).ok).toBe(true);
    }
  });

  it('allows a local non-TLS database in development and test', () => {
    const local = 'postgres://app_runtime:synthetic@127.0.0.1:5432/platform';
    expect(parseApiEnv({ ...valid, APP_ENV: 'development', API_DATABASE_URL: local }).ok).toBe(
      true,
    );
  });

  it('bounds the pool size', () => {
    expect(parseApiEnv({ ...valid, API_DATABASE_POOL_MAX: '0' }).ok).toBe(false);
    expect(parseApiEnv({ ...valid, API_DATABASE_POOL_MAX: '101' }).ok).toBe(false);
    expect(parseApiEnv({ ...valid, API_DATABASE_POOL_MAX: '25' }).ok).toBe(true);
  });
});
