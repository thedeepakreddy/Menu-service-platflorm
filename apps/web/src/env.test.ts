import { describe, expect, it } from 'vitest';

import { parseWebEnv } from './env';

describe('parseWebEnv', () => {
  it('accepts a valid configuration', () => {
    expect(parseWebEnv({ APP_ENV: 'production' })).toEqual({
      APP_ENV: 'production',
      WEB_OWNER_OIDC_SCOPES: '',
      WEB_OPERATOR_OIDC_SCOPES: '',
      WEB_TRUSTED_PROXY_HOPS: 0,
      WEB_TOKEN_REQUESTS_PER_MINUTE: 600,
    });
  });

  it('rejects a missing APP_ENV', () => {
    expect(() => parseWebEnv({})).toThrow(/APP_ENV is required/);
  });

  it('rejects an unknown APP_ENV without echoing the value', () => {
    let message = '';
    try {
      parseWebEnv({ APP_ENV: 'sk-live-THIS-MUST-NOT-LEAK' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/APP_ENV is invalid/);
    expect(message).not.toContain('sk-live-THIS-MUST-NOT-LEAK');
  });
});

describe('login configuration (D-030, D-034, D-038)', () => {
  const secret = Buffer.alloc(32, 7).toString('base64url');
  const owner = {
    WEB_OWNER_OIDC_ISSUER: 'https://idp.example',
    WEB_OWNER_OIDC_CLIENT_ID: 'owner-web',
    WEB_OWNER_OIDC_CLIENT_SECRET: 'synthetic-secret',
  };
  const full = {
    APP_ENV: 'production',
    WEB_PUBLIC_ORIGIN: 'https://app.example',
    WEB_SESSION_SECRET: secret,
    WEB_API_ORIGIN: 'https://api.internal.example',
    WEB_API_BFF_CREDENTIAL: 'synthetic-bff-credential-for-tests-only-00000',
    ...owner,
  };

  it('accepts a complete owner login domain', () => {
    expect(() => parseWebEnv(full)).not.toThrow();
  });

  it.each([
    [
      'a partial domain',
      { ...full, WEB_OWNER_OIDC_CLIENT_SECRET: undefined },
      'WEB_OWNER_OIDC_CLIENT_SECRET',
    ],
    ['no public origin', { ...full, WEB_PUBLIC_ORIGIN: undefined }, 'WEB_PUBLIC_ORIGIN'],
    ['no session secret', { ...full, WEB_SESSION_SECRET: undefined }, 'WEB_SESSION_SECRET'],
    [
      'a short session secret',
      { ...full, WEB_SESSION_SECRET: Buffer.alloc(16).toString('base64url') },
      'WEB_SESSION_SECRET',
    ],
    [
      'a session secret longer than 32 bytes (no silent truncation, C-10)',
      { ...full, WEB_SESSION_SECRET: Buffer.alloc(48, 7).toString('base64url') },
      'WEB_SESSION_SECRET',
    ],
    [
      'a passphrase as the session secret (C-10)',
      { ...full, WEB_SESSION_SECRET: 'correct horse battery staple and more words' },
      'WEB_SESSION_SECRET',
    ],
    ['no API origin', { ...full, WEB_API_ORIGIN: undefined }, 'WEB_API_ORIGIN'],
    [
      'an http API origin in production',
      { ...full, WEB_API_ORIGIN: 'http://api.example' },
      'WEB_API_ORIGIN',
    ],
    ['no BFF credential', { ...full, WEB_API_BFF_CREDENTIAL: undefined }, 'WEB_API_BFF_CREDENTIAL'],
    [
      'a short BFF credential',
      { ...full, WEB_API_BFF_CREDENTIAL: 'short' },
      'WEB_API_BFF_CREDENTIAL',
    ],
    ['too many proxy hops', { ...full, WEB_TRUSTED_PROXY_HOPS: '6' }, 'WEB_TRUSTED_PROXY_HOPS'],
    [
      'an origin with a path',
      { ...full, WEB_PUBLIC_ORIGIN: 'https://app.example/x' },
      'WEB_PUBLIC_ORIGIN',
    ],
    [
      'an http origin in production',
      { ...full, WEB_PUBLIC_ORIGIN: 'http://app.example' },
      'WEB_PUBLIC_ORIGIN',
    ],
    [
      'an http issuer in production',
      { ...full, WEB_OWNER_OIDC_ISSUER: 'http://idp.example' },
      'WEB_OWNER_OIDC_ISSUER',
    ],
  ])('rejects %s, naming the variable but not the secret', (_label, env, variable) => {
    let message = '';
    try {
      parseWebEnv(env);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(variable);
    expect(message).not.toContain('synthetic-secret');
    expect(message).not.toContain(secret);
  });

  it('allows http on loopback in development', () => {
    expect(() =>
      parseWebEnv({
        ...full,
        APP_ENV: 'development',
        WEB_PUBLIC_ORIGIN: 'http://127.0.0.1:3000',
        WEB_OWNER_OIDC_ISSUER: 'http://127.0.0.1:9000',
        WEB_API_ORIGIN: 'http://127.0.0.1:4000',
      }),
    ).not.toThrow();
  });
});
