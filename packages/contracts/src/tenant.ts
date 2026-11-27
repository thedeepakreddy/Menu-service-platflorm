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

/** No control characters (NUL and friends never reach the database, audit B-08). */
const NO_CONTROL = /^\P{Cc}*$/u;

/** Why an operator acts; recorded in the operator audit (10–500 characters, D-028). */
export const operatorReasonSchema = z.string().trim().min(10).max(500).regex(NO_CONTROL);

/**
 * Identity-provider issuer: an https URL with no credentials, query or fragment (audit B-08).
 * The database enforces the same rule (migration 0006).
 */
export const issuerSchema = z
  .string()
  .max(500)
  .regex(/^https:\/\/[^/?#@\s\p{Cc}]+(\/[^?#@\s\p{Cc}]*)?$/u);

/** Owner identity at the identity provider: issuer URL + subject (D-025). */
export const ownerIdentitySchema = z
  .object({
    issuer: issuerSchema,
    subject: z
      .string()
      .min(1)
      .max(500)
      .regex(/^[^\s\p{Cc}]+$/u),
  })
  .strict();
export type OwnerIdentity = z.infer<typeof ownerIdentitySchema>;

/**
 * Optional client-chosen operation id (audit B-02). Retrying with the same id can never apply an
 * operation twice; `GET /operator/operations/:id` tells whether it was applied.
 */
const operationIdSchema = z.uuid().optional();

/** `POST /operator/tenants`: provision a tenant with its first owner (onboarding foundation). */
export const provisionTenantRequestSchema = z
  .object({
    slug: tenantSlugSchema,
    displayName: z.string().trim().min(1).max(200).regex(NO_CONTROL),
    owner: ownerIdentitySchema,
    reason: operatorReasonSchema,
    operationId: operationIdSchema,
  })
  .strict();
export type ProvisionTenantRequest = z.infer<typeof provisionTenantRequestSchema>;

/** `POST /operator/tenants/:slug/status`: compare-and-set lifecycle change. */
export const tenantStatusChangeRequestSchema = z
  .object({
    expectedStatus: tenantStatusSchema,
    status: tenantStatusSchema,
    reason: operatorReasonSchema,
    operationId: operationIdSchema,
  })
  .strict();
export type TenantStatusChangeRequest = z.infer<typeof tenantStatusChangeRequestSchema>;

/** Operator view of a tenant (no internal tenant id). */
export const operatorTenantSchema = z
  .object({
    slug: tenantSlugSchema,
    displayName: z.string().min(1).max(200),
    status: tenantStatusSchema,
  })
  .strict();
export type OperatorTenant = z.infer<typeof operatorTenantSchema>;

/** Owner account lifecycle states (D-036). */
export const accountStatusSchema = z.enum(['active', 'deactivated']);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

/** Operator view of an owner account (`GET /operator/accounts/:accountId`). */
export const operatorAccountSchema = z
  .object({
    accountId: z.uuid(),
    status: accountStatusSchema,
    /** Null while the identity is unlinked. */
    identity: ownerIdentitySchema.nullable(),
  })
  .strict();
export type OperatorAccount = z.infer<typeof operatorAccountSchema>;

/** `GET /operator/tenants/:slug`: the tenant and its current active owner (null if none). */
export const operatorTenantDetailSchema = operatorTenantSchema
  .extend({ owner: operatorAccountSchema.nullable() })
  .strict();
export type OperatorTenantDetail = z.infer<typeof operatorTenantDetailSchema>;

/** `POST /operator/accounts/:accountId/status`: deactivate or reactivate (compare-and-set). */
export const accountStatusChangeRequestSchema = z
  .object({
    expectedStatus: accountStatusSchema,
    status: accountStatusSchema,
    reason: operatorReasonSchema,
    operationId: operationIdSchema,
  })
  .strict();
export type AccountStatusChangeRequest = z.infer<typeof accountStatusChangeRequestSchema>;

/** `POST /operator/tenants/:slug/owner/revoke`: end the owner's access (non-active tenant only). */
export const revokeOwnerRequestSchema = z
  .object({
    expectedOwnerAccountId: z.uuid(),
    reason: operatorReasonSchema,
    operationId: operationIdSchema,
  })
  .strict();
export type RevokeOwnerRequest = z.infer<typeof revokeOwnerRequestSchema>;

/** `POST /operator/tenants/:slug/owner/transfer`: controlled ownership transfer. */
export const transferOwnershipRequestSchema = z
  .object({
    /** The current owner as last read (null = the tenant currently has none). */
    expectedOwnerAccountId: z.uuid().nullable(),
    newOwner: ownerIdentitySchema,
    reason: operatorReasonSchema,
    operationId: operationIdSchema,
  })
  .strict();
export type TransferOwnershipRequest = z.infer<typeof transferOwnershipRequestSchema>;

/** `POST /operator/accounts/:accountId/identity/unlink`. */
export const unlinkIdentityRequestSchema = z
  .object({
    expectedIdentity: ownerIdentitySchema,
    reason: operatorReasonSchema,
    operationId: operationIdSchema,
  })
  .strict();
export type UnlinkIdentityRequest = z.infer<typeof unlinkIdentityRequestSchema>;

/** `POST /operator/accounts/:accountId/identity/link` (the account stays deactivated). */
export const linkIdentityRequestSchema = z
  .object({
    identity: ownerIdentitySchema,
    reason: operatorReasonSchema,
    operationId: operationIdSchema,
  })
  .strict();
export type LinkIdentityRequest = z.infer<typeof linkIdentityRequestSchema>;

/** Result of an account lifecycle action. */
export const accountLifecycleResultSchema = z
  .object({
    accountId: z.uuid(),
    status: accountStatusSchema,
    sessionsRevoked: z.number().int().min(0),
  })
  .strict();
export type AccountLifecycleResult = z.infer<typeof accountLifecycleResultSchema>;

/** Result of an ownership change. */
export const ownershipResultSchema = z
  .object({
    slug: tenantSlugSchema,
    status: tenantStatusSchema,
    ownerAccountId: z.uuid().nullable(),
  })
  .strict();
export type OwnershipResult = z.infer<typeof ownershipResultSchema>;

/** `GET /operator/operations/:operationId`: whether an operation was applied (audit B-02). */
export const operationOutcomeSchema = z
  .object({
    operationId: z.uuid(),
    applied: z.boolean(),
    action: z.string().nullable(),
  })
  .strict();
export type OperationOutcome = z.infer<typeof operationOutcomeSchema>;
