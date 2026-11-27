import { describe, expect, it } from 'vitest';

import { hstsHeader, webSecurityHeaders } from './security-headers';

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
