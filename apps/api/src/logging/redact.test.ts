import { describe, expect, it } from 'vitest';

import {
  applyRules,
  MAX_ENTRIES,
  MAX_STRING_LENGTH,
  REDACTED,
  redact,
  redactString,
  SCAN_LIMIT,
  TRUNCATED_MARKER,
} from './redact.js';

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

// Audit F-05: patterns the independent audit found unredacted (synthetic values only).
describe('redactString (audit F-05 cases)', () => {
  it.each([
    ['env-style upper-case key', 'DB_PASSWORD=hunter2Synthetic', 'hunter2Synthetic'],
    ['env-style token', 'GITHUB_TOKEN=ghp_SYNTHabcdefghijklmnopqrstu', 'ghp_SYNTH'],
    ['AWS secret env', 'AWS_SECRET_ACCESS_KEY=wJalrSYNTHETICKEY', 'wJalrSYNTHETICKEY'],
    ['camelCase key', 'dbPassword=hunter2Synthetic', 'hunter2Synthetic'],
    ['colon separator', 'apiToken: abc123synthetic', 'abc123synthetic'],
    ['Authorization: Token', 'Authorization: Token abc123synthetic', 'abc123synthetic'],
    [
      'Authorization: Digest',
      'Authorization: Digest username="u", response="r3sp0nse"',
      'r3sp0nse',
    ],
    ['URL-encoded bearer', 'Bearer%20abc123synthetic', 'abc123synthetic'],
    ['double-escaped JSON', String.raw`{\"password\":\"hunter2Synthetic\"}`, 'hunter2Synthetic'],
    ['URL password containing @', 'postgres://user:p@ss@db.example/x', 'p@ss'],
    [
      'presigned URL signature',
      'https://s3.example/x?X-Amz-Signature=deadbeefSYNTH',
      'deadbeefSYNTH',
    ],
    ['OAuth code in a query', 'https://app.example/cb?code=SYNTHcode123', 'SYNTHcode123'],
    [
      'PGP private key',
      '-----BEGIN PGP PRIVATE KEY BLOCK-----\nSYNTHKEY\n-----END PGP PRIVATE KEY BLOCK-----',
      'SYNTHKEY',
    ],
    [
      'PEM key without END line',
      '-----BEGIN RSA PRIVATE KEY-----\nMIISYNTHETICKEY',
      'MIISYNTHETICKEY',
    ],
    [
      'Stripe secret key',
      'charge failed sk_live_SYNTHETIC1234567890',
      'sk_live_SYNTHETIC1234567890',
    ],
    ['Slack token', 'xoxb-1234567890-SYNTHETIC', 'xoxb-1234567890-SYNTHETIC'],
    ['value after a non-sensitive pair', 'info: password=hunter2Synthetic', 'hunter2Synthetic'],
  ])('redacts %s', (_label, input, secret) => {
    expect(redactString(input)).not.toContain(secret);
  });

  it('redacts URL-encoded e-mail addresses', () => {
    expect(redactString('user%40example.com')).toBe('[REDACTED_EMAIL]');
  });

  it('does not treat ordinary words as query secrets outside a URL query', () => {
    expect(redactString('status code: 404')).toBe('status code: 404');
    expect(redactString('state=ready')).toBe('state=ready');
  });

  it('documents a known limit: phone numbers and names are not detected', () => {
    expect(redactString('call +1 415 555 0100')).toBe('call +1 415 555 0100');
  });
});

// Audit F-01: redaction must cost linear time, and the input is bounded before any pattern runs.
describe('redaction cost (audit F-01)', () => {
  /** Median wall time of `fn` over a few runs, in milliseconds. */
  function medianMs(fn: () => void, runs = 5): number {
    const times: number[] = [];
    for (let i = 0; i < runs; i += 1) {
      const start = performance.now();
      fn();
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    return times[Math.floor(runs / 2)] ?? 0;
  }

  const SIZE = 64 * 1024;
  const fill = (unit: string) => unit.repeat(Math.ceil(SIZE / unit.length)).slice(0, SIZE);

  // One generator per pattern family: each defeated the old `\b<class>+` anchoring.
  const pathological: [string, string][] = [
    ['e-mail local part (a.a.a.…)', fill('a.')],
    ['e-mail with dashes', fill('a-')],
    ['URL scheme (a+a+…)', fill('a+')],
    ['URL scheme then no //', fill('a.b:')],
    ['JWT prefix (eyJ-eyJ-…)', fill('eyJ-')],
    ['key=value chains (a:a:…)', fill('a:')],
    ['key=value quoted chains', fill('a:"a')],
    ['bearer without token', fill('Bearer ')],
    ['PEM headers without END', fill('-----BEGIN PRIVATE KEY-----x')],
    ['@ runs', fill('a@')],
  ];

  // The old patterns took ~0.4 s on 16 KB and grow quadratically (≈6 s on 64 KB);
  // linear patterns take about a millisecond. 250 ms leaves a wide margin on slow CI.
  it.each(pathological)('the patterns stay linear on 64 KB of %s', (_label, input) => {
    expect(medianMs(() => applyRules(input))).toBeLessThan(250);
  });

  it('cuts the input to SCAN_LIMIT before any pattern runs', () => {
    const secretBeyondLimit = `${'x'.repeat(SCAN_LIMIT)} password=hunter2Synthetic`;
    const out = redactString(secretBeyondLimit);
    expect(out).not.toContain('hunter2Synthetic');
    expect(out.length).toBeLessThanOrEqual(MAX_STRING_LENGTH + TRUNCATED_MARKER.length);
    expect(out.endsWith(TRUNCATED_MARKER)).toBe(true);
  });

  it('still redacts a secret that starts just before the output cap', () => {
    const input = `${'x'.repeat(MAX_STRING_LENGTH - 20)} password=hunter2Synthetic ${'y'.repeat(2000)}`;
    expect(redactString(input)).not.toContain('hunter2');
  });

  it('a 1 MB input produces a bounded result', () => {
    const out = redactString('a.'.repeat(512 * 1024));
    expect(out.length).toBeLessThanOrEqual(MAX_STRING_LENGTH + TRUNCATED_MARKER.length);
  });
});

describe('redact (structural bounds, audit F-01/F-07)', () => {
  it('bounds the number of array items and object keys', () => {
    const many = Array.from({ length: MAX_ENTRIES + 50 }, (_, i) => i);
    const arr = redact(many) as unknown[];
    expect(arr).toHaveLength(MAX_ENTRIES + 1);
    expect(arr.at(-1)).toBe('[50 more items]');
    const obj = redact(Object.fromEntries(many.map((i) => [`k${String(i)}`, i])));
    expect(Object.keys(obj as object)).toHaveLength(MAX_ENTRIES + 1);
  });

  it('converts BigInt and Date values instead of losing or throwing on them', () => {
    expect(redact({ n: 12n, d: new Date(0) })).toEqual({ n: '12', d: '1970-01-01T00:00:00.000Z' });
  });

  it('redacts nested strings inside arrays', () => {
    expect(redact({ list: ['ok', 'password=p4ss'] })).toEqual({
      list: ['ok', `password=${REDACTED}`],
    });
  });
});
