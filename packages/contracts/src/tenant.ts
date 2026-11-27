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

/** Response of `GET /owner/tenants/:slug`: the caller's own tenant and role (Phase 2: owner). */
export const ownerTenantSchema = z
  .object({
    slug: tenantSlugSchema,
    displayName: z.string().min(1).max(200),
    role: z.literal('owner'),
  })
  .strict();

export type OwnerTenant = z.infer<typeof ownerTenantSchema>;

/** Tenant lifecycle states (D-027): active <-> suspended; either -> retired (terminal). */
export const tenantStatusSchema = z.enum(['active', 'suspended', 'retired']);
export type TenantStatus = z.infer<typeof tenantStatusSchema>;

/** Why an operator acts; recorded in the operator audit (10–500 characters, D-028). */
export const operatorReasonSchema = z.string().trim().min(10).max(500);

/** Owner identity at the identity provider: issuer URL + subject (D-025). */
const ownerIdentitySchema = z
  .object({
    issuer: z.url({ protocol: /^https?$/ }).max(500),
    subject: z.string().min(1).max(500),
  })
  .strict();

/** `POST /operator/tenants`: provision a tenant with its first owner (onboarding foundation). */
export const provisionTenantRequestSchema = z
  .object({
    slug: tenantSlugSchema,
    displayName: z.string().trim().min(1).max(200),
    owner: ownerIdentitySchema,
    reason: operatorReasonSchema,
  })
  .strict();
export type ProvisionTenantRequest = z.infer<typeof provisionTenantRequestSchema>;

/** `POST /operator/tenants/:slug/status`: compare-and-set lifecycle change. */
export const tenantStatusChangeRequestSchema = z
  .object({
    expectedStatus: tenantStatusSchema,
    status: tenantStatusSchema,
    reason: operatorReasonSchema,
  })
  .strict();
export type TenantStatusChangeRequest = z.infer<typeof tenantStatusChangeRequestSchema>;

/** Operator view of a tenant (no internal id). */
export const operatorTenantSchema = z
  .object({
    slug: tenantSlugSchema,
    displayName: z.string().min(1).max(200),
    status: tenantStatusSchema,
  })
  .strict();
export type OperatorTenant = z.infer<typeof operatorTenantSchema>;
