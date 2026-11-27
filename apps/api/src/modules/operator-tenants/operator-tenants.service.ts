import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import type {
  OperatorTenant,
  ProvisionTenantRequest,
  TenantStatusChangeRequest,
} from '@platform/contracts';
import { sql } from 'kysely';

import type { Db } from '../../infrastructure/database/database.js';
import { OPERATOR_DATABASE } from '../../infrastructure/database/database.module.js';

type Row = { slug: string; display_name: string; status: OperatorTenant['status'] };

/** SQLSTATE → HTTP mapping for the operator functions (migrations/0004). */
function mapDatabaseError(error: unknown): never {
  const code = (error as { code?: unknown } | undefined)?.code;
  switch (code) {
    case 'PTN01':
      throw new NotFoundException();
    case 'PTC01': // stale expected status
    case 'PTK01': // owner identity already bound to an operator account
    case '23505': // slug already taken
      throw new ConflictException();
    case 'PTI01':
      throw new UnprocessableEntityException();
    case '23514':
      throw new BadRequestException();
    default:
      throw error;
  }
}

/**
 * Operator tenant provisioning and lifecycle (Phase 2 M2.4; D-027, D-028). Every action is
 * logged before it runs and after it completes, outside the database transaction, so the log
 * shipped to the store of record keeps a trail even when the transaction (and its in-database
 * audit row) rolls back.
 */
@Injectable()
export class OperatorTenantsService {
  private readonly audit = new Logger('OperatorAudit');

  constructor(@Inject(OPERATOR_DATABASE) private readonly db: Db | null) {}

  private database(): Db {
    // Fail closed: without the operator credential no operator action can run.
    if (this.db === null) throw new ServiceUnavailableException();
    return this.db;
  }

  private async run(
    operatorAccountId: string,
    action: string,
    tenantSlug: string,
    reason: string,
    call: (db: Db) => Promise<Row | undefined>,
  ): Promise<OperatorTenant> {
    const db = this.database();
    this.audit.log({
      event: 'operator_action',
      phase: 'attempt',
      action,
      operatorAccountId,
      tenantSlug,
      reason,
    });
    try {
      const row = await call(db);
      if (row === undefined) throw new NotFoundException();
      this.audit.log({
        event: 'operator_action',
        phase: 'result',
        action,
        operatorAccountId,
        tenantSlug,
        outcome: 'applied',
      });
      return { slug: row.slug, displayName: row.display_name, status: row.status };
    } catch (error) {
      const code = (error as { code?: unknown } | undefined)?.code;
      this.audit.warn({
        event: 'operator_action',
        phase: 'result',
        action,
        operatorAccountId,
        tenantSlug,
        outcome: 'rejected',
        code: typeof code === 'string' ? code : 'error',
      });
      if (error instanceof Error && 'getStatus' in error) throw error;
      return mapDatabaseError(error);
    }
  }

  provision(operatorAccountId: string, request: ProvisionTenantRequest): Promise<OperatorTenant> {
    return this.run(
      operatorAccountId,
      'tenant.provision',
      request.slug,
      request.reason,
      async (db) => {
        const { rows } = await sql<Row>`
        SELECT slug, display_name, status FROM app.operator_provision_tenant(
          ${operatorAccountId}, ${request.reason}, ${request.slug}, ${request.displayName},
          ${request.owner.issuer}, ${request.owner.subject})
      `.execute(db);
        return rows[0];
      },
    );
  }

  changeStatus(
    operatorAccountId: string,
    slug: string,
    request: TenantStatusChangeRequest,
  ): Promise<OperatorTenant> {
    const action = `tenant.status.${request.expectedStatus}_to_${request.status}`;
    return this.run(operatorAccountId, action, slug, request.reason, async (db) => {
      const { rows } = await sql<Row>`
        SELECT slug, display_name, status FROM app.operator_set_tenant_status(
          ${operatorAccountId}, ${request.reason}, ${slug}, ${request.expectedStatus}, ${request.status})
      `.execute(db);
      return rows[0];
    });
  }
}
