import { describe, expect, it } from 'vitest';

import { parseApiEnv } from './env.js';

// Synthetic connection string; sslmode=require so production-like cases are valid too.
const DB_URL = 'postgres://app_runtime:synthetic@db.internal:5432/platform?sslmode=require';
const OPERATOR_DB_URL =
  'postgres://app_operator:synthetic@db.internal:5432/platform?sslmode=require';
// Synthetic OIDC trust domains (required in staging/production, D-025, D-034).
const OIDC = {
  API_OWNER_OIDC_ISSUER: 'https://owners.idp.example',
  API_OWNER_OIDC_AUDIENCE: 'platform-owner-api',
  API_OWNER_OIDC_JWKS_URL: 'https://owners.idp.example/jwks',
  API_OWNER_OIDC_CLIENT_ID: 'owner-web',
  API_OPERATOR_OIDC_ISSUER: 'https://operators.idp.example',
  API_OPERATOR_OIDC_AUDIENCE: 'platform-operator-api',
  API_OPERATOR_OIDC_JWKS_URL: 'https://operators.idp.example/jwks',
  API_OPERATOR_OIDC_CLIENT_ID: 'operator-web',
};
// Synthetic BFF credential (43 base64url characters); not a secret.
const BFF = 'synthetic-bff-credential-not-a-secret-000000';
const valid = {
  APP_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: '4000',
  API_DATABASE_URL: DB_URL,
  API_OPERATOR_DATABASE_URL: OPERATOR_DB_URL,
  API_BFF_CREDENTIAL: BFF,
  ...OIDC,
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
        API_OPERATOR_MFA_MAX_AGE_SECONDS: 3600,
        API_OWNER_SESSION_IDLE_SECONDS: 1800,
        API_OPERATOR_SESSION_IDLE_SECONDS: 900,
        API_TRUSTED_PROXIES: [],
        API_BFF_CREDENTIAL: BFF,
        API_OPERATOR_DATABASE_URL: OPERATOR_DB_URL,
        ...OIDC,
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

describe('identity trust domains (D-025)', () => {
  it('requires both trust domains, over https, in staging and production', () => {
    for (const appEnv of ['staging', 'production']) {
      const without = {
        ...valid,
        APP_ENV: appEnv,
        API_OPERATOR_OIDC_ISSUER: undefined,
        API_OPERATOR_OIDC_AUDIENCE: undefined,
        API_OPERATOR_OIDC_JWKS_URL: undefined,
        API_OPERATOR_OIDC_CLIENT_ID: undefined,
      };
      expect(parseApiEnv(without).ok).toBe(false);
      const http = {
        ...valid,
        APP_ENV: appEnv,
        API_OWNER_OIDC_JWKS_URL: 'http://owners.idp.example/jwks',
      };
      expect(parseApiEnv(http).ok).toBe(false);
      expect(parseApiEnv({ ...valid, APP_ENV: appEnv }).ok).toBe(true);
    }
  });

  it('allows unconfigured domains in development and test (their routes fail closed)', () => {
    const bare = {
      APP_ENV: 'development',
      API_HOST: '127.0.0.1',
      API_PORT: '4000',
      API_DATABASE_URL: DB_URL,
    };
    expect(parseApiEnv(bare).ok).toBe(true);
  });

  it('rejects a partially configured domain', () => {
    const partial = { ...valid, API_OWNER_OIDC_JWKS_URL: undefined };
    const result = parseApiEnv(partial);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.variable)).toContain('API_OWNER_OIDC_JWKS_URL');
  });

  it('rejects owner and operator sharing one issuer and audience', () => {
    const merged = {
      ...valid,
      API_OPERATOR_OIDC_ISSUER: OIDC.API_OWNER_OIDC_ISSUER,
      API_OPERATOR_OIDC_AUDIENCE: OIDC.API_OWNER_OIDC_AUDIENCE,
    };
    expect(parseApiEnv(merged).ok).toBe(false);
  });

  it('rejects owner and operator sharing one web client', () => {
    expect(
      parseApiEnv({ ...valid, API_OPERATOR_OIDC_CLIENT_ID: OIDC.API_OWNER_OIDC_CLIENT_ID }).ok,
    ).toBe(false);
  });
});

describe('sessions and the BFF credential (D-034)', () => {
  it('requires the BFF credential whenever a login domain is configured', () => {
    const result = parseApiEnv({ ...valid, API_BFF_CREDENTIAL: undefined });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      variable: 'API_BFF_CREDENTIAL',
      problem: 'is required',
    });
  });

  it.each(['too-short', 'has spaces in it and is long enough to pass the length rule ok'])(
    'rejects a weak or malformed BFF credential without echoing it: %s',
    (value) => {
      const result = parseApiEnv({ ...valid, API_BFF_CREDENTIAL: value });
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain(value);
    },
  );

  it('caps the operator MFA age at one hour (audit C-08)', () => {
    expect(parseApiEnv({ ...valid, API_OPERATOR_MFA_MAX_AGE_SECONDS: '3600' }).ok).toBe(true);
    expect(parseApiEnv({ ...valid, API_OPERATOR_MFA_MAX_AGE_SECONDS: '3601' }).ok).toBe(false);
  });

  it('bounds the idle timeouts', () => {
    expect(parseApiEnv({ ...valid, API_OWNER_SESSION_IDLE_SECONDS: '59' }).ok).toBe(false);
    expect(parseApiEnv({ ...valid, API_OPERATOR_SESSION_IDLE_SECONDS: '3601' }).ok).toBe(false);
  });
});

describe('API_TRUSTED_PROXIES (D-037)', () => {
  it('accepts exact addresses and CIDR ranges', () => {
    const result = parseApiEnv({ ...valid, API_TRUSTED_PROXIES: '10.0.0.1, 10.1.0.0/16,fd00::/8' });
    expect(result.ok && result.env.API_TRUSTED_PROXIES).toEqual([
      '10.0.0.1',
      '10.1.0.0/16',
      'fd00::/8',
    ]);
  });

  it.each(['*', '10.0.0.0/33', 'proxy.internal', '10.0.0.0/x', '0.0.0.0/-1'])(
    'rejects %s',
    (value) => {
      expect(parseApiEnv({ ...valid, API_TRUSTED_PROXIES: value }).ok).toBe(false);
    },
  );
});

describe('operator database configuration (D-028)', () => {
  it.each(['staging', 'production'])('is required, over TLS, in %s', (appEnv) => {
    expect(
      parseApiEnv({ ...valid, APP_ENV: appEnv, API_OPERATOR_DATABASE_URL: undefined }).ok,
    ).toBe(false);
    const plain = 'postgres://app_operator:synthetic@db.internal:5432/platform';
    expect(parseApiEnv({ ...valid, APP_ENV: appEnv, API_OPERATOR_DATABASE_URL: plain }).ok).toBe(
      false,
    );
    expect(parseApiEnv({ ...valid, APP_ENV: appEnv }).ok).toBe(true);
  });

  it('is optional in development and test', () => {
    expect(parseApiEnv({ ...valid, API_OPERATOR_DATABASE_URL: undefined }).ok).toBe(true);
  });
});
