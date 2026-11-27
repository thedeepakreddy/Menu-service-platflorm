import { describe, expect, it } from 'vitest';

import { resolveRequestId } from './request-id.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('keeps a well-formed client id', () => {
    expect(resolveRequestId('client-req-0001')).toBe('client-req-0001');
  });

  it.each([undefined, '', 'short', 'bad id with spaces', 'x'.repeat(129), ['a', 'b'], 42])(
    'replaces %j with a generated UUID',
    (incoming) => {
      expect(resolveRequestId(incoming)).toMatch(uuid);
    },
  );

  it('generates distinct ids', () => {
    expect(resolveRequestId(undefined)).not.toBe(resolveRequestId(undefined));
  });
});
