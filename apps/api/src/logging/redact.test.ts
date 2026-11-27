import { describe, expect, it } from 'vitest';

import { MAX_STRING_LENGTH, REDACTED, redact, redactString } from './redact.js';

describe('redactString', () => {
  it.each([
    ['bearer token', 'auth failed: Bearer abc.DEF-123_xyz', 'abc.DEF-123_xyz'],
    ['basic credentials', 'header Basic dXNlcjpwYXNz', 'dXNlcjpwYXNz'],
    ['JWT', 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig_part-1', 'eyJzdWIiOiIxIn0'],
    ['URL credentials', 'connect postgres://app:s3cr3t@db.internal:5432/x failed', 's3cr3t'],
    ['password=', 'login password=hunter2 rejected', 'hunter2'],
    ['quoted secret', 'config secret: "very secret value"', 'very secret value'],
    ['api_key', 'call with api_key=AKIA0000 failed', 'AKIA0000'],
    ['access_token in query-like text', 'redirect ?access_token=tok123&x=1', 'tok123'],
    // Found by the Phase 1 completion adversarial review:
    ['lowercase bearer', 'auth bearer abc123secret', 'abc123secret'],
    ['JSON-quoted token', '{"token":"tok_SECRET1"}', 'tok_SECRET1'],
    [
      'PEM private key',
      '-----BEGIN PRIVATE KEY-----\nMIIEvQSECRET3\n-----END PRIVATE KEY-----',
      'MIIEvQSECRET3',
    ],
    ['AWS access key id', 'key AKIAIOSFODNN7EXAMPLE used', 'AKIAIOSFODNN7EXAMPLE'],
  ])('redacts %s', (_label, input, secret) => {
    const out = redactString(input);
    expect(out).not.toContain(secret);
    expect(out).toContain(REDACTED);
  });

  it('redacts e-mail addresses (personal data)', () => {
    expect(redactString('user jane.doe@example.com failed')).toBe('user [REDACTED_EMAIL] failed');
  });

  it('keeps harmless text unchanged', () => {
    expect(redactString('GET /health 200 in 1.2ms')).toBe('GET /health 200 in 1.2ms');
  });

  it('truncates very long strings', () => {
    const out = redactString('x'.repeat(MAX_STRING_LENGTH + 100));
    expect(out.length).toBeLessThan(MAX_STRING_LENGTH + 20);
    expect(out).toMatch(/\[truncated\]$/);
  });
});

describe('redact (structured values)', () => {
  it('replaces sensitive keys at any depth, case-insensitively', () => {
    const input = {
      headers: { Authorization: 'Bearer x', Cookie: 'sid=1', 'X-Api-Key': 'k', accept: 'json' },
      nested: { deeper: { password: 'p', refresh_token: 'r', clientSecret: 's', ok: 1 } },
    };
    expect(redact(input)).toEqual({
      headers: { Authorization: REDACTED, Cookie: REDACTED, 'X-Api-Key': REDACTED, accept: 'json' },
      nested: {
        deeper: { password: REDACTED, refresh_token: REDACTED, clientSecret: REDACTED, ok: 1 },
      },
    });
  });

  it('serializes errors with redacted message and stack', () => {
    const error = new Error('db postgres://u:pw@h/db down');
    const out = redact(error) as { name: string; message: string; stack?: string };
    expect(out.name).toBe('Error');
    expect(out.message).not.toContain(':pw@');
    expect(out.stack).not.toContain(':pw@');
  });

  it('matches sensitive key variants by substring', () => {
    expect(
      redact({
        'x-auth-token': 'a',
        bearerToken: 'b',
        dbPassword: 'c',
        AUTHORIZATION: 'd',
        status: 200,
      }),
    ).toEqual({
      'x-auth-token': REDACTED,
      bearerToken: REDACTED,
      dbPassword: REDACTED,
      AUTHORIZATION: REDACTED,
      status: 200,
    });
  });

  it('does not redact the fields the API itself logs', () => {
    const entry = {
      event: 'request',
      method: 'GET',
      path: '/health',
      status: 200,
      durationMs: 1.2,
      requestId: 'abcdefgh',
      code: 'NOT_FOUND',
      context: 'HTTP',
      level: 'info',
      time: 't',
    };
    expect(redact(entry)).toEqual(entry);
  });

  it('does not mutate its input', () => {
    const input = { password: 'p' };
    redact(input);
    expect(input.password).toBe('p');
  });

  it('bounds recursion depth', () => {
    type Node = { child?: Node };
    const root: Node = {};
    let cursor = root;
    for (let i = 0; i < 20; i += 1) {
      cursor.child = {};
      cursor = cursor.child;
    }
    expect(JSON.stringify(redact(root))).toContain('[depth limit]');
  });
});
