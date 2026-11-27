import { describe, expect, it } from 'vitest';

import { parseWebEnv } from './env';

describe('parseWebEnv', () => {
  it('accepts a valid configuration', () => {
    expect(parseWebEnv({ APP_ENV: 'production' })).toEqual({
      APP_ENV: 'production',
      WEB_OWNER_OIDC_SCOPES: '',
      WEB_OPERATOR_OIDC_SCOPES: '',
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

describe('login configuration (D-030, D-033)', () => {
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
      }),
    ).not.toThrow();
  });
});
