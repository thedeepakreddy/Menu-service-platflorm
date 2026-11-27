import { describe, expect, it } from 'vitest';

import { webSecurityHeaders } from './security-headers';

const keys = (appEnv: Parameters<typeof webSecurityHeaders>[0]) =>
  webSecurityHeaders(appEnv).map((h) => h.key);

describe('webSecurityHeaders', () => {
  it('always sets the baseline headers', () => {
    expect(keys('development')).toEqual([
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Cross-Origin-Opener-Policy',
    ]);
  });

  it.each(['staging', 'production'] as const)('adds HSTS in %s', (appEnv) => {
    expect(webSecurityHeaders(appEnv)).toContainEqual({
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000',
    });
  });

  it.each(['development', 'test'] as const)('omits HSTS in %s', (appEnv) => {
    expect(keys(appEnv)).not.toContain('Strict-Transport-Security');
  });
});
