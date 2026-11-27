import { z } from 'zod';

import { toTenantId, withTenant } from '../database/database.js';
import type { Db, TenantId, TenantTransaction } from '../database/database.js';

/**
 * Tenant-safe cache and job boundaries (Doc 05 §13 Phase 2; decision D-027).
 *
 * Phase 2 has no cache and no job queue (their implementation choice is open, G-19). These are
 * the only sanctioned entry points for both. Any cache or worker added later must use them, so
 * the tenant boundary is enforced in one place:
 *
 *  - a cache key always starts with the tenant id: two tenants can never share an entry;
 *  - a job always carries a validated tenant id and runs inside `withTenant()` for that tenant
 *    only; a job without a tenant, or with a malformed one, is refused before any work.
 */

/** Cache key namespaced by tenant. Parts must be non-empty and contain no separator. */
export function tenantCacheKey(tenantId: TenantId, ...parts: string[]): string {
  const id = toTenantId(tenantId);
  if (parts.length === 0 || parts.some((p) => p.length === 0 || p.includes('|'))) {
    throw new RangeError('cache key parts must be non-empty and contain no "|"');
  }
  return `tenant:${id}|${parts.join('|')}`;
}

/** The envelope every background job uses. `tenantId` is mandatory. */
export const tenantJobSchema = z
  .object({
    tenantId: z.uuid(),
    type: z.string().regex(/^[a-z][a-z0-9_.-]{0,99}$/),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
export type TenantJob = z.infer<typeof tenantJobSchema>;

export class TenantJobRejectedError extends Error {
  override name = 'TenantJobRejectedError';
}

/** Validates a job and runs its handler inside its own tenant's context, and nowhere else. */
export async function runTenantJob<T>(
  db: Db,
  raw: unknown,
  handler: (job: TenantJob, trx: TenantTransaction) => Promise<T>,
): Promise<T> {
  const parsed = tenantJobSchema.safeParse(raw);
  if (!parsed.success) throw new TenantJobRejectedError('job refused: missing or invalid tenant');
  const job = parsed.data;
  return withTenant(db, toTenantId(job.tenantId), (trx) => handler(job, trx));
}
