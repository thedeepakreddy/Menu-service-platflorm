import { describe, expect, it } from 'vitest';

import { publicTenantSchema, RESERVED_TENANT_SLUGS, tenantSlugSchema } from './index.js';

describe('tenantSlugSchema (D-027)', () => {
  it.each(['cafe-roma', 'abc', 'b2b-bakery-42', 'a'.repeat(63)])('accepts %s', (slug) => {
    expect(tenantSlugSchema.safeParse(slug).success).toBe(true);
  });

  it.each([
    ['too short', 'ab'],
    ['too long', 'a'.repeat(64)],
    ['upper case', 'Cafe-Roma'],
    ['leading hyphen', '-cafe'],
    ['trailing hyphen', 'cafe-'],
    ['underscore', 'cafe_roma'],
    ['dot', 'cafe.roma'],
    ['slash', 'cafe/roma'],
    ['quote injection', "cafe'--"],
    ['percent-encoding', 'cafe%27'],
    ['unicode look-alike', 'cаfe'], // Cyrillic а
    ['whitespace', 'cafe roma'],
    ['empty', ''],
  ])('rejects %s', (_label, slug) => {
    expect(tenantSlugSchema.safeParse(slug).success).toBe(false);
  });

  it('rejects every reserved slug', () => {
    for (const slug of RESERVED_TENANT_SLUGS)
      expect(tenantSlugSchema.safeParse(slug).success).toBe(false);
  });
});

describe('publicTenantSchema', () => {
  it('accepts public fields only and never an id', () => {
    expect(
      publicTenantSchema.safeParse({ slug: 'cafe-roma', displayName: 'Café Roma' }).success,
    ).toBe(true);
    expect(
      publicTenantSchema.safeParse({
        slug: 'cafe-roma',
        displayName: 'Café Roma',
        id: '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a',
      }).success,
    ).toBe(false);
  });
});
