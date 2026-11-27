import { describe, expect, it } from 'vitest';

import { errorEnvelopeSchema, healthResponseSchema, requestIdSchema } from './index.js';

describe('healthResponseSchema', () => {
  it('accepts the health payload', () => {
    expect(healthResponseSchema.parse({ status: 'ok', service: 'api' })).toEqual({
      status: 'ok',
      service: 'api',
    });
  });

  it('rejects unknown fields and wrong values', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok', service: 'api', extra: 1 }).success).toBe(
      false,
    );
    expect(healthResponseSchema.safeParse({ status: 'down', service: 'api' }).success).toBe(false);
  });
});

describe('errorEnvelopeSchema', () => {
  const valid = {
    error: { code: 'NOT_FOUND', message: 'Not found.', requestId: 'abcdef12-3456' },
  };

  it('accepts a well-formed envelope', () => {
    expect(errorEnvelopeSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects unknown codes, empty messages and extra fields', () => {
    expect(
      errorEnvelopeSchema.safeParse({ error: { ...valid.error, code: 'TEAPOT' } }).success,
    ).toBe(false);
    expect(errorEnvelopeSchema.safeParse({ error: { ...valid.error, message: '' } }).success).toBe(
      false,
    );
    expect(
      errorEnvelopeSchema.safeParse({ error: { ...valid.error, stack: 'at x' } }).success,
    ).toBe(false);
  });
});

describe('requestIdSchema', () => {
  it.each(['abcdefgh', '0f8fad5b-d9cb-469f-a165-70867728950e', 'A_b-C_d-1234'])(
    'accepts %s',
    (id) => {
      expect(requestIdSchema.safeParse(id).success).toBe(true);
    },
  );

  it.each([
    'short',
    'has space in it',
    'semi;colon-1234',
    'x'.repeat(129),
    '<script>alert</script>',
  ])('rejects %s', (id) => {
    expect(requestIdSchema.safeParse(id).success).toBe(false);
  });
});
