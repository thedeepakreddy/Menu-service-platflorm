import { describe, expect, it } from 'vitest';

import {
  contentSecurityPolicy,
  cspNonce,
  hstsHeader,
  webSecurityHeaders,
} from './security-headers';

describe('webSecurityHeaders', () => {
  it('sets the environment-independent baseline headers', () => {
    expect(webSecurityHeaders().map((h) => h.key)).toEqual([
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Cross-Origin-Opener-Policy',
    ]);
  });

  it('never includes HSTS, which must be decided at request time (F-04)', () => {
    expect(webSecurityHeaders().map((h) => h.key)).not.toContain('Strict-Transport-Security');
  });
});

describe('hstsHeader', () => {
  it.each(['staging', 'production'] as const)('is sent in %s', (appEnv) => {
    expect(hstsHeader(appEnv)).toEqual({
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000',
    });
  });

  it.each(['development', 'test'] as const)('is not sent in %s', (appEnv) => {
    expect(hstsHeader(appEnv)).toBeUndefined();
  });
});

describe('contentSecurityPolicy (Phase 3 M3.5, G-31)', () => {
  const base = {
    nonce: 'abc123==',
    appEnv: 'production' as const,
    devServer: false,
    formActionOrigins: ['https://idp.example'],
  };
  const directives = (csp: string) =>
    new Map(
      csp.split('; ').map((d) => {
        const [name = '', ...values] = d.split(' ');
        return [name, values] as const;
      }),
    );

  it('lets scripts run only with the request nonce: no inline, no eval, no foreign hosts', () => {
    const script = directives(contentSecurityPolicy(base)).get('script-src');
    expect(script).toEqual(["'self'", "'nonce-abc123=='", "'strict-dynamic'"]);
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it('allows eval only under the development server', () => {
    const dev = directives(
      contentSecurityPolicy({ ...base, appEnv: 'development', devServer: true }),
    );
    expect(dev.get('script-src')).toContain("'unsafe-eval'");
  });

  it('forbids plugins, framing, <base> hijacking and foreign form targets', () => {
    const d = directives(contentSecurityPolicy(base));
    expect(d.get('object-src')).toEqual(["'none'"]);
    expect(d.get('frame-ancestors')).toEqual(["'none'"]);
    expect(d.get('frame-src')).toEqual(["'none'"]);
    expect(d.get('base-uri')).toEqual(["'none'"]);
    expect(d.get('form-action')).toEqual(["'self'", 'https://idp.example']);
    expect(d.get('default-src')).toEqual(["'self'"]);
  });

  it('upgrades insecure requests only where HTTPS is guaranteed', () => {
    expect(directives(contentSecurityPolicy(base)).has('upgrade-insecure-requests')).toBe(true);
    for (const appEnv of ['development', 'test'] as const) {
      expect(
        directives(contentSecurityPolicy({ ...base, appEnv })).has('upgrade-insecure-requests'),
      ).toBe(false);
    }
  });

  it('never contains a wildcard source', () => {
    expect(contentSecurityPolicy(base)).not.toMatch(/(^|\s)\*(\s|;|$)|https:(\s|;|$)/);
  });

  it('nonces are fresh, 128-bit and base64', () => {
    const nonces = new Set(Array.from({ length: 200 }, () => cspNonce()));
    expect(nonces.size).toBe(200);
    for (const n of nonces) expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
