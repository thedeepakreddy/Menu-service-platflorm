import { z } from 'zod';

/**
 * Public tenant identification (decision D-027). Tenants are addressed in public URLs by a slug;
 * internal tenant ids never appear in public URLs or responses (Doc 03 §18).
 *
 * Slug: 3–63 characters, lower-case letters, digits and inner hyphens. The same rule is enforced
 * by a CHECK constraint in the database (apps/api/migrations/0001_tenancy_foundation.sql).
 */
export const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

/** Slugs that would collide with platform routes or mislead users. */
export const RESERVED_TENANT_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'health',
  'help',
  'login',
  'logout',
  'operator',
  'owner',
  'platform',
  'public',
  'static',
  'status',
  'support',
  'www',
]);

export const tenantSlugSchema = z
  .string()
  .regex(TENANT_SLUG_PATTERN)
  .refine((slug) => !RESERVED_TENANT_SLUGS.has(slug), 'reserved slug');

export type TenantSlug = z.infer<typeof tenantSlugSchema>;

/** Response of `GET /public/tenants/:slug`: public fields of an active tenant only. */
export const publicTenantSchema = z
  .object({
    slug: tenantSlugSchema,
    displayName: z.string().min(1).max(200),
  })
  .strict();

export type PublicTenant = z.infer<typeof publicTenantSchema>;
