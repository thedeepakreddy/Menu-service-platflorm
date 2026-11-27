import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  AccountLifecycleResult,
  AccountStatusChangeRequest,
  LinkIdentityRequest,
  OperationOutcome,
  OperatorAccount,
  OperatorTenant,
  OperatorTenantDetail,
  OwnerIdentity,
  OwnershipResult,
  ProvisionTenantRequest,
  RevokeOwnerRequest,
  TenantStatusChangeRequest,
  TransferOwnershipRequest,
  UnlinkIdentityRequest,
} from '@platform/contracts';
import { sql } from 'kysely';

import { isDatabaseUnavailable, withReadRetry } from '../../infrastructure/database/database.js';
import type { Db } from '../../infrastructure/database/database.js';
import { OPERATOR_DATABASE } from '../../infrastructure/database/database.module.js';
import type { Principal } from '../identity/index.js';

/** Operator-function SQLSTATEs (migrations/0006) → HTTP. Each means "rolled back, not applied". */
const REJECTION_STATUS: Record<string, () => HttpException> = {
  PTA01: () => new UnauthorizedException(),
  PTN01: () => new NotFoundException(),
  PTB01: () => new ConflictException(),
  PTC01: () => new ConflictException(),
  PTK01: () => new ConflictException(),
  PTO01: () => new ConflictException(),
  PTS01: () => new ConflictException(),
  '23505': () => new ConflictException(),
  PTI01: () => new UnprocessableEntityException(),
  '23514': () => new BadRequestException(),
  '22001': () => new BadRequestException(),
  '22021': () => new BadRequestException(),
  '22P02': () => new BadRequestException(),
  '22P05': () => new BadRequestException(),
};

const DUPLICATE_OPERATION_CONSTRAINT = 'operator_audit_operation_id_key';

type DbError = { code?: unknown; constraint?: unknown };

/** The caller supplied an owner identity from a different issuer than the owner login domain. */
export const OWNER_ISSUER = Symbol('OWNER_ISSUER');

/**
 * Operator control plane (Phase 2 M2.4 + audit remediation; D-027, D-028, D-034, D-036).
 *
 * - The operator is NEVER passed as an id: every database function receives the operator's
 *   session token hash and derives the operator account from a live MFA session itself (B-03).
 * - Every mutation carries an operation id, unique in the audit table (B-02). The audit row is in
 *   the same transaction as the change, so after a lost connection the outcome is resolved by
 *   looking the id up; the log never says "rejected" for an operation that may have applied.
 *   Retrying with the same id can never apply it twice.
 * - Every attempt and outcome is logged outside the database (the shipped log is the trail of
 *   record for attempts that roll back, D-028), with the request id (B-10).
 */
@Injectable()
export class OperatorTenantsService {
  private readonly audit = new Logger('OperatorAudit');

  constructor(
    @Inject(OPERATOR_DATABASE) private readonly db: Db | null,
    @Inject(OWNER_ISSUER) private readonly ownerIssuer: string | null,
  ) {}

  private database(): Db {
    // Fail closed: without the operator credential no operator action can run.
    if (this.db === null) throw new ServiceUnavailableException();
    return this.db;
  }

  /** E-11: owner identities must belong to the configured owner login domain. */
  private checkOwnerIssuer(identity: OwnerIdentity): void {
    if (this.ownerIssuer !== null && identity.issuer !== this.ownerIssuer) {
      throw new UnprocessableEntityException();
    }
  }

  private async mutate<T>(
    principal: Principal,
    requestId: string | undefined,
    action: string,
    target: string,
    reason: string,
    operationId: string | undefined,
    call: (db: Db, operationId: string) => Promise<T | undefined>,
  ): Promise<T> {
    const db = this.database();
    const op = operationId ?? randomUUID();
    const base = {
      event: 'operator_action',
      action,
      target,
      operationId: op,
      operatorAccountId: principal.accountId,
      requestId,
    };
    this.audit.log({ ...base, phase: 'attempt', reason });
    let result: T | undefined;
    try {
      result = await call(db, op);
    } catch (error) {
      const { code, constraint } = (error ?? {}) as DbError;
      if (code === '23505' && constraint === DUPLICATE_OPERATION_CONSTRAINT) {
        // The same operation id was already used: nothing was applied by THIS call.
        this.audit.warn({ ...base, phase: 'result', outcome: 'duplicate_operation' });
        throw new ConflictException();
      }
      const rejection = typeof code === 'string' ? REJECTION_STATUS[code] : undefined;
      if (rejection !== undefined) {
        this.audit.warn({ ...base, phase: 'result', outcome: 'rejected', code });
        throw rejection();
      }
      // Anything else (connection lost, timeout, unknown fault): the outcome is UNKNOWN until
      // reconciled. Never report it as rejected.
      const outcome = await this.reconcile(principal, op);
      this.audit.error({
        ...base,
        phase: 'result',
        outcome,
        code: typeof code === 'string' ? code : 'error',
      });
      if (isDatabaseUnavailable(error) || outcome !== 'not_applied') {
        throw new ServiceUnavailableException();
      }
      throw error;
    }
    if (result === undefined) {
      // A function returned no row: impossible for these functions; treat as a fault, reconciled.
      const outcome = await this.reconcile(principal, op);
      this.audit.error({ ...base, phase: 'result', outcome, code: 'no_row' });
      throw new ServiceUnavailableException();
    }
    this.audit.log({ ...base, phase: 'result', outcome: 'applied' });
    return result;
  }

  /** applied | not_applied | unknown — from the audit row, which commits with the change. */
  private async reconcile(
    principal: Principal,
    operationId: string,
  ): Promise<'applied' | 'not_applied' | 'unknown'> {
    try {
      const outcome = await this.outcome(principal, operationId);
      return outcome.applied ? 'applied' : 'not_applied';
    } catch {
      return 'unknown';
    }
  }

  async outcome(principal: Principal, operationId: string): Promise<OperationOutcome> {
    const db = this.database();
    try {
      const { rows } = await withReadRetry(() =>
        sql<{ applied: boolean; action: string | null }>`
          SELECT applied, action
          FROM app.operator_operation_outcome(${principal.sessionTokenHash}, ${operationId}::uuid)
        `.execute(db),
      );
      const row = rows[0];
      return { operationId, applied: row?.applied ?? false, action: row?.action ?? null };
    } catch (error) {
      throw mapRead(error);
    }
  }

  provision(
    principal: Principal,
    requestId: string | undefined,
    request: ProvisionTenantRequest,
  ): Promise<OperatorTenant> {
    this.checkOwnerIssuer(request.owner);
    return this.mutate(
      principal,
      requestId,
      'tenant.provision',
      request.slug,
      request.reason,
      request.operationId,
      async (db, op) => {
        const { rows } = await sql<{
          slug: string;
          display_name: string;
          status: OperatorTenant['status'];
        }>`
          SELECT slug, display_name, status FROM app.operator_provision_tenant(
            ${principal.sessionTokenHash}, ${op}::uuid, ${request.reason}, ${request.slug},
            ${request.displayName}, ${request.owner.issuer}, ${request.owner.subject})
        `.execute(db);
        const row = rows[0];
        return row && { slug: row.slug, displayName: row.display_name, status: row.status };
      },
    );
  }

  changeStatus(
    principal: Principal,
    requestId: string | undefined,
    slug: string,
    request: TenantStatusChangeRequest,
  ): Promise<OperatorTenant> {
    return this.mutate(
      principal,
      requestId,
      `tenant.status.${request.expectedStatus}_to_${request.status}`,
      slug,
      request.reason,
      request.operationId,
      async (db, op) => {
        const { rows } = await sql<{
          slug: string;
          display_name: string;
          status: OperatorTenant['status'];
        }>`
          SELECT slug, display_name, status FROM app.operator_set_tenant_status(
            ${principal.sessionTokenHash}, ${op}::uuid, ${request.reason}, ${slug},
            ${request.expectedStatus}, ${request.status})
        `.execute(db);
        const row = rows[0];
        return row && { slug: row.slug, displayName: row.display_name, status: row.status };
      },
    );
  }

  async tenant(principal: Principal, slug: string): Promise<OperatorTenantDetail> {
    const db = this.database();
    try {
      const { rows } = await withReadRetry(() =>
        sql<{
          slug: string;
          display_name: string;
          status: OperatorTenant['status'];
          owner_account: string | null;
          owner_status: OperatorAccount['status'] | null;
          owner_issuer: string | null;
          owner_subject: string | null;
        }>`
          SELECT * FROM app.operator_get_tenant(${principal.sessionTokenHash}, ${slug})
        `.execute(db),
      );
      const row = rows[0];
      if (row === undefined) throw new NotFoundException();
      return {
        slug: row.slug,
        displayName: row.display_name,
        status: row.status,
        owner:
          row.owner_account === null || row.owner_status === null
            ? null
            : {
                accountId: row.owner_account,
                status: row.owner_status,
                identity: identityOf(row.owner_issuer, row.owner_subject),
              },
      };
    } catch (error) {
      throw mapRead(error);
    }
  }

  async account(principal: Principal, accountId: string): Promise<OperatorAccount> {
    const db = this.database();
    try {
      const { rows } = await withReadRetry(() =>
        sql<{
          account_id: string;
          status: OperatorAccount['status'];
          issuer: string | null;
          subject: string | null;
        }>`
          SELECT account_id, status, issuer, subject
          FROM app.operator_get_account(${principal.sessionTokenHash}, ${accountId}::uuid)
        `.execute(db),
      );
      const row = rows[0];
      if (row === undefined) throw new NotFoundException();
      return {
        accountId: row.account_id,
        status: row.status,
        identity: identityOf(row.issuer, row.subject),
      };
    } catch (error) {
      throw mapRead(error);
    }
  }

  setAccountStatus(
    principal: Principal,
    requestId: string | undefined,
    accountId: string,
    request: AccountStatusChangeRequest,
  ): Promise<AccountLifecycleResult> {
    return this.mutate(
      principal,
      requestId,
      `account.status.${request.expectedStatus}_to_${request.status}`,
      accountId,
      request.reason,
      request.operationId,
      async (db, op) => {
        const { rows } = await sql<LifecycleRow>`
          SELECT account_id, status, sessions_revoked FROM app.operator_set_account_status(
            ${principal.sessionTokenHash}, ${op}::uuid, ${request.reason}, ${accountId}::uuid,
            ${request.expectedStatus}, ${request.status})
        `.execute(db);
        return lifecycle(rows[0]);
      },
    );
  }

  unlinkIdentity(
    principal: Principal,
    requestId: string | undefined,
    accountId: string,
    request: UnlinkIdentityRequest,
  ): Promise<AccountLifecycleResult> {
    return this.mutate(
      principal,
      requestId,
      'account.identity.unlink',
      accountId,
      request.reason,
      request.operationId,
      async (db, op) => {
        const { rows } = await sql<LifecycleRow>`
          SELECT account_id, status, sessions_revoked FROM app.operator_unlink_account_identity(
            ${principal.sessionTokenHash}, ${op}::uuid, ${request.reason}, ${accountId}::uuid,
            ${request.expectedIdentity.issuer}, ${request.expectedIdentity.subject})
        `.execute(db);
        return lifecycle(rows[0]);
      },
    );
  }

  linkIdentity(
    principal: Principal,
    requestId: string | undefined,
    accountId: string,
    request: LinkIdentityRequest,
  ): Promise<AccountLifecycleResult> {
    this.checkOwnerIssuer(request.identity);
    return this.mutate(
      principal,
      requestId,
      'account.identity.link',
      accountId,
      request.reason,
      request.operationId,
      async (db, op) => {
        const { rows } = await sql<{ account_id: string; status: OperatorAccount['status'] }>`
          SELECT account_id, status FROM app.operator_link_account_identity(
            ${principal.sessionTokenHash}, ${op}::uuid, ${request.reason}, ${accountId}::uuid,
            ${request.identity.issuer}, ${request.identity.subject})
        `.execute(db);
        const row = rows[0];
        return row && { accountId: row.account_id, status: row.status, sessionsRevoked: 0 };
      },
    );
  }

  revokeOwner(
    principal: Principal,
    requestId: string | undefined,
    slug: string,
    request: RevokeOwnerRequest,
  ): Promise<OwnershipResult> {
    return this.mutate(
      principal,
      requestId,
      'tenant.owner.revoke',
      slug,
      request.reason,
      request.operationId,
      async (db, op) => {
        const { rows } = await sql<{ slug: string; status: OperatorTenant['status'] }>`
          SELECT slug, status FROM app.operator_revoke_owner_membership(
            ${principal.sessionTokenHash}, ${op}::uuid, ${request.reason}, ${slug},
            ${request.expectedOwnerAccountId}::uuid)
        `.execute(db);
        const row = rows[0];
        return row && { slug: row.slug, status: row.status, ownerAccountId: null };
      },
    );
  }

  transferOwnership(
    principal: Principal,
    requestId: string | undefined,
    slug: string,
    request: TransferOwnershipRequest,
  ): Promise<OwnershipResult> {
    this.checkOwnerIssuer(request.newOwner);
    return this.mutate(
      principal,
      requestId,
      'tenant.owner.transfer',
      slug,
      request.reason,
      request.operationId,
      async (db, op) => {
        const { rows } = await sql<{
          slug: string;
          status: OperatorTenant['status'];
          owner_account: string;
        }>`
          SELECT slug, status, owner_account FROM app.operator_transfer_ownership(
            ${principal.sessionTokenHash}, ${op}::uuid, ${request.reason}, ${slug},
            ${request.expectedOwnerAccountId}::uuid, ${request.newOwner.issuer},
            ${request.newOwner.subject})
        `.execute(db);
        const row = rows[0];
        return row && { slug: row.slug, status: row.status, ownerAccountId: row.owner_account };
      },
    );
  }
}

type LifecycleRow = {
  account_id: string;
  status: OperatorAccount['status'];
  sessions_revoked: number;
};

function lifecycle(row: LifecycleRow | undefined): AccountLifecycleResult | undefined {
  return (
    row && { accountId: row.account_id, status: row.status, sessionsRevoked: row.sessions_revoked }
  );
}

function identityOf(issuer: string | null, subject: string | null): OwnerIdentity | null {
  return issuer === null || subject === null ? null : { issuer, subject };
}

/** Maps a read error: known rejections to their HTTP status; unavailability is left to the filter. */
function mapRead(error: unknown): unknown {
  if (error instanceof HttpException) return error;
  const code = (error as DbError | undefined)?.code;
  const rejection = typeof code === 'string' ? REJECTION_STATUS[code] : undefined;
  return rejection === undefined ? error : rejection();
}
