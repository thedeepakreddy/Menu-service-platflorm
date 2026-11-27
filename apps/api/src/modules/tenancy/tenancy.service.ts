import { Inject, Injectable } from '@nestjs/common';
import { tenantSlugSchema } from '@platform/contracts';
import { sql } from 'kysely';

import { toTenantId, withReadRetry, withTenant } from '../../infrastructure/database/database.js';
import type { Db, TenantId } from '../../infrastructure/database/database.js';
import { DATABASE } from '../../infrastructure/database/database.module.js';

/**
 * A tenant resolved server-side (D-027). `id` is internal: it is used only to open a
 * `withTenant()` context and must never be returned to clients or put in public URLs.
 */
export type ResolvedTenant = {
  readonly id: TenantId;
  readonly slug: string;
  readonly displayName: string;
};

@Injectable()
export class TenancyService {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  /**
   * Resolves a public slug to an ACTIVE tenant. Returns undefined for a malformed or reserved
   * slug (checked before any query), an unknown slug, and a suspended or retired tenant alike.
   */
  async resolveActiveTenant(slug: string): Promise<ResolvedTenant | undefined> {
    const parsed = tenantSlugSchema.safeParse(slug);
    if (!parsed.success) return undefined;
    // Idempotent read: retried once if a pooled connection was just lost (audit B-01).
    const { rows } = await withReadRetry(() =>
      sql<{ id: string; slug: string; display_name: string }>`
        SELECT id, slug, display_name FROM app.resolve_active_tenant(${parsed.data})
      `.execute(this.db),
    );
    const row = rows[0];
    if (row === undefined) return undefined;
    return { id: toTenantId(row.id), slug: row.slug, displayName: row.display_name };
  }

  /**
   * The tenant an owner account may act in (D-027): the slug must resolve to an ACTIVE tenant AND
   * the account must hold an active membership there. The membership is read inside the tenant's
   * own context, so row-level security enforces the check too. Undefined otherwise.
   */
  async ownerTenant(accountId: string, slug: string): Promise<ResolvedTenant | undefined> {
    const tenant = await this.resolveActiveTenant(slug);
    if (tenant === undefined) return undefined;
    const member = await withReadRetry(() =>
      withTenant(this.db, tenant.id, (trx) =>
        trx
          .selectFrom('app.memberships')
          .select('role')
          .where('account_id', '=', accountId)
          .where('status', '=', 'active')
          .executeTakeFirst(),
      ),
    );
    return member === undefined ? undefined : tenant;
  }
}
