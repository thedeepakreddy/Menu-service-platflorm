// Operator control plane end to end against real PostgreSQL (D-027, D-028, D-034, D-036; audit
// E-01, B-02, B-03, B-07–B-10, E-10, E-11). Covers tenant provisioning and lifecycle, the owner
// account lifecycle (deactivate/reactivate, revoke, unlink/re-link, transfer), orphan and takeover
// prevention, stale-state handling, races, session invalidation, audit records and outcomes.
import { randomUUID } from 'node:crypto';

import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import {
  createIdps,
  identityConfig,
  OWNER_API,
  OWNER_CLIENT,
  OWNER_ISSUER,
  startTestApp,
} from '../../../test/db/app.js';
import type { TestApp, TestIdps } from '../../../test/db/app.js';
import {
  adminQuery,
  asRole,
  bffHeaders,
  seedAccount,
  seedOperator,
  seedSession,
  seedTenant,
  slug,
  tokenHash,
} from '../../../test/db/fixtures.js';
import { createDatabase } from '../../infrastructure/database/database.js';
import type { Db } from '../../infrastructure/database/database.js';
import { JsonLogger } from '../../logging/json-logger.js';
import { OperatorTenantsService } from './operator-tenants.service.js';

const { adminUrl, runtimeUrl, operatorUrl } = inject('database');
const REASON = 'Synthetic test reason for the audit trail';

let idps: TestIdps;
let api: TestApp;
let operator: { accountId: string; token: string };

beforeAll(async () => {
  idps = await createIdps();
  api = await startTestApp({ runtimeUrl, operatorUrl, identity: identityConfig(idps) });
  operator = await seedOperator(adminUrl);
});

afterAll(async () => {
  await api.close();
});

type Res = { status: number; body: Record<string, unknown> };

async function call(
  method: string,
  path: string,
  body?: unknown,
  token = operator.token,
): Promise<Res> {
  const res = await fetch(`${api.url}${path}`, {
    method,
    headers: bffHeaders(token),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return {
    status: res.status,
    body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>),
  };
}

const identity = (subject: string) => ({ issuer: OWNER_ISSUER, subject });

async function provision(subject = `owner-${randomUUID()}`, s = slug('lc')) {
  const res = await call('POST', '/operator/tenants', {
    slug: s,
    displayName: 'Lifecycle Co',
    owner: identity(subject),
    reason: REASON,
  });
  expect(res.status).toBe(201);
  const detail = await call('GET', `/operator/tenants/${s}`);
  return {
    slug: s,
    subject,
    ownerAccountId: (detail.body.owner as { accountId: string }).accountId,
  };
}

/** An owner session for an identity, through the real login endpoint. */
async function ownerSession(subject: string): Promise<string | undefined> {
  const tokens = await idps.owner.login({
    clientId: OWNER_CLIENT,
    apiAudience: OWNER_API,
    subject,
  });
  const res = await fetch(`${api.url}/auth/sessions`, {
    method: 'POST',
    headers: bffHeaders(),
    body: JSON.stringify({ kind: 'owner', ...tokens }),
  });
  return res.status === 201
    ? ((await res.json()) as { sessionToken: string }).sessionToken
    : undefined;
}

const ownerView = (session: string, s: string) =>
  fetch(`${api.url}/owner/tenants/${s}`, { headers: bffHeaders(session) }).then((r) => r.status);

async function auditRows(operationId?: string) {
  const { rows } = await adminQuery<{
    action: string;
    operator_account: string;
    operator_session: string | null;
    target_account: string | null;
    operation_id: string;
  }>(
    adminUrl,
    `SELECT action, operator_account, operator_session, target_account, operation_id
     FROM app.operator_audit WHERE ($1::uuid IS NULL OR operation_id = $1) ORDER BY id`,
    [operationId ?? null],
  );
  return rows;
}

describe('provisioning and tenant lifecycle', () => {
  it('provisions a tenant with its owner; the owner can log in and see it', async () => {
    const t = await provision();
    const session = await ownerSession(t.subject);
    expect(session).toBeDefined();
    expect(await ownerView(session ?? '', t.slug)).toBe(200);
  });

  it("suspension ends the owner's sessions at once; reactivation needs an active owner", async () => {
    const t = await provision();
    const session = (await ownerSession(t.subject)) ?? '';
    const suspended = await call('POST', `/operator/tenants/${t.slug}/status`, {
      expectedStatus: 'active',
      status: 'suspended',
      reason: REASON,
    });
    expect(suspended.body).toMatchObject({ status: 'suspended' });
    expect(await ownerView(session, t.slug)).toBe(401); // revoked, not merely hidden
    const back = await call('POST', `/operator/tenants/${t.slug}/status`, {
      expectedStatus: 'suspended',
      status: 'active',
      reason: REASON,
    });
    expect(back.status).toBe(200);
    expect(await ownerView((await ownerSession(t.subject)) ?? '', t.slug)).toBe(200);
  });

  it('stale expected status is a 409 and changes nothing', async () => {
    const t = await provision();
    const res = await call('POST', `/operator/tenants/${t.slug}/status`, {
      expectedStatus: 'suspended',
      status: 'active',
      reason: REASON,
    });
    expect(res.status).toBe(409);
  });
});

describe('owner account lifecycle (E-01)', () => {
  it('deactivation is refused while the account owns an active tenant (orphan prevention)', async () => {
    const t = await provision();
    const res = await call('POST', `/operator/accounts/${t.ownerAccountId}/status`, {
      expectedStatus: 'active',
      status: 'deactivated',
      reason: REASON,
    });
    expect(res.status).toBe(409);
  });

  it('suspend → deactivate revokes sessions and blocks login; reactivate restores login', async () => {
    const t = await provision();
    const session = (await ownerSession(t.subject)) ?? '';
    await call('POST', `/operator/tenants/${t.slug}/status`, {
      expectedStatus: 'active',
      status: 'suspended',
      reason: REASON,
    });
    const other = await seedTenant(adminUrl, { owner: t.ownerAccountId, status: 'suspended' });
    const lateSession = await seedSession(adminUrl, t.ownerAccountId, 'owner');
    const off = await call('POST', `/operator/accounts/${t.ownerAccountId}/status`, {
      expectedStatus: 'active',
      status: 'deactivated',
      reason: REASON,
    });
    expect(off.status).toBe(200);
    expect(off.body.sessionsRevoked).toBeGreaterThanOrEqual(1);
    expect(await ownerView(session, t.slug)).toBe(401);
    expect(await ownerView(lateSession, other.slug)).toBe(401);
    expect(await ownerSession(t.subject)).toBeUndefined(); // cannot log in
    // A suspended tenant cannot be reactivated with a deactivated owner.
    const reactivateTenant = await call('POST', `/operator/tenants/${t.slug}/status`, {
      expectedStatus: 'suspended',
      status: 'active',
      reason: REASON,
    });
    expect(reactivateTenant.status).toBe(409);
    const on = await call('POST', `/operator/accounts/${t.ownerAccountId}/status`, {
      expectedStatus: 'deactivated',
      status: 'active',
      reason: REASON,
    });
    expect(on.status).toBe(200);
    expect(await ownerSession(t.subject)).toBeDefined();
  });

  it('owner access revocation: refused on an active tenant, applied on a suspended one', async () => {
    const t = await provision();
    const body = { expectedOwnerAccountId: t.ownerAccountId, reason: REASON };
    expect((await call('POST', `/operator/tenants/${t.slug}/owner/revoke`, body)).status).toBe(409);
    await call('POST', `/operator/tenants/${t.slug}/status`, {
      expectedStatus: 'active',
      status: 'suspended',
      reason: REASON,
    });
    const session = await seedSession(adminUrl, t.ownerAccountId, 'owner');
    const res = await call('POST', `/operator/tenants/${t.slug}/owner/revoke`, body);
    expect(res.status).toBe(200);
    expect(await ownerView(session, t.slug)).toBe(401);
    const detail = await call('GET', `/operator/tenants/${t.slug}`);
    expect(detail.body.owner).toBeNull();
    // An ownerless tenant cannot be reactivated.
    const reactivate = await call('POST', `/operator/tenants/${t.slug}/status`, {
      expectedStatus: 'suspended',
      status: 'active',
      reason: REASON,
    });
    expect(reactivate.status).toBe(409);
  });

  it('identity unlink and two-step re-link (no automatic reactivation)', async () => {
    const t = await provision();
    await call('POST', `/operator/tenants/${t.slug}/status`, {
      expectedStatus: 'active',
      status: 'suspended',
      reason: REASON,
    });
    const session = (await ownerSession(t.subject)) ?? 'none';
    // Stale expected identity: refused.
    const stale = await call('POST', `/operator/accounts/${t.ownerAccountId}/identity/unlink`, {
      expectedIdentity: identity('someone-else'),
      reason: REASON,
    });
    expect(stale.status).toBe(409);
    const unlink = await call('POST', `/operator/accounts/${t.ownerAccountId}/identity/unlink`, {
      expectedIdentity: identity(t.subject),
      reason: REASON,
    });
    expect(unlink.body).toMatchObject({ status: 'deactivated' });
    expect(await ownerView(session, t.slug)).toBe(401);
    expect(await ownerSession(t.subject)).toBeUndefined(); // the old identity maps to nothing
    // Reactivation is refused while unlinked.
    const early = await call('POST', `/operator/accounts/${t.ownerAccountId}/status`, {
      expectedStatus: 'deactivated',
      status: 'active',
      reason: REASON,
    });
    expect(early.status).toBe(422);
    const newSubject = `relinked-${randomUUID()}`;
    const link = await call('POST', `/operator/accounts/${t.ownerAccountId}/identity/link`, {
      identity: identity(newSubject),
      reason: REASON,
    });
    expect(link.body).toMatchObject({ status: 'deactivated' });
    expect(await ownerSession(newSubject)).toBeUndefined(); // still deactivated
    await call('POST', `/operator/accounts/${t.ownerAccountId}/status`, {
      expectedStatus: 'deactivated',
      status: 'active',
      reason: REASON,
    });
    expect(await ownerSession(newSubject)).toBeDefined();
  });

  it('re-linking to an identity already bound to another account is refused (takeover)', async () => {
    const victim = await provision();
    const t = await provision();
    await call('POST', `/operator/tenants/${t.slug}/status`, {
      expectedStatus: 'active',
      status: 'suspended',
      reason: REASON,
    });
    await call('POST', `/operator/accounts/${t.ownerAccountId}/identity/unlink`, {
      expectedIdentity: identity(t.subject),
      reason: REASON,
    });
    const res = await call('POST', `/operator/accounts/${t.ownerAccountId}/identity/link`, {
      identity: identity(victim.subject),
      reason: REASON,
    });
    expect(res.status).toBe(409);
  });

  it('identities from a foreign issuer are refused (E-11)', async () => {
    const res = await call('POST', '/operator/tenants', {
      slug: slug('foreign'),
      displayName: 'Foreign',
      owner: { issuer: 'https://evil.idp.test', subject: 'x' },
      reason: REASON,
    });
    expect(res.status).toBe(422);
  });
});

describe('ownership transfer (E-01)', () => {
  it('transfers ownership: the old owner loses access and sessions, the new owner gains it', async () => {
    const t = await provision();
    const oldSession = (await ownerSession(t.subject)) ?? '';
    const newSubject = `new-owner-${randomUUID()}`;
    const res = await call('POST', `/operator/tenants/${t.slug}/owner/transfer`, {
      expectedOwnerAccountId: t.ownerAccountId,
      newOwner: identity(newSubject),
      reason: REASON,
    });
    expect(res.status).toBe(200);
    expect(res.body.ownerAccountId).not.toBe(t.ownerAccountId);
    expect(await ownerView(oldSession, t.slug)).toBe(401);
    // Even a NEW session of the old owner cannot see the tenant any more.
    expect(await ownerView((await ownerSession(t.subject)) ?? '', t.slug)).toBe(404);
    expect(await ownerView((await ownerSession(newSubject)) ?? '', t.slug)).toBe(200);
    const { rows } = await adminQuery<{ n: number }>(
      adminUrl,
      `SELECT count(*)::int AS n FROM app.memberships m JOIN app.tenants t ON t.id = m.tenant_id
       WHERE t.slug = $1 AND m.status = 'active'`,
      [t.slug],
    );
    expect(rows[0]?.n).toBe(1); // exactly one active owner
  });

  it('a stale expected owner is refused (no blind takeover)', async () => {
    const t = await provision();
    const res = await call('POST', `/operator/tenants/${t.slug}/owner/transfer`, {
      expectedOwnerAccountId: randomUUID(),
      newOwner: identity(`x-${randomUUID()}`),
      reason: REASON,
    });
    expect(res.status).toBe(409);
  });

  it('an operator identity, a deactivated account or the current owner cannot become the owner', async () => {
    const t = await provision();
    const opSubject = `op-${randomUUID()}`;
    await seedAccount(adminUrl, { issuer: OWNER_ISSUER, subject: opSubject, kind: 'operator' });
    const deadSubject = `dead-${randomUUID()}`;
    await seedAccount(adminUrl, {
      issuer: OWNER_ISSUER,
      subject: deadSubject,
      status: 'deactivated',
    });
    const attempt = (subject: string) =>
      call('POST', `/operator/tenants/${t.slug}/owner/transfer`, {
        expectedOwnerAccountId: t.ownerAccountId,
        newOwner: identity(subject),
        reason: REASON,
      });
    expect((await attempt(opSubject)).status).toBe(409);
    expect((await attempt(deadSubject)).status).toBe(409);
    expect((await attempt(t.subject)).status).toBe(422);
  });

  it('concurrent transfers: exactly one wins, the other is a 409, one active owner remains', async () => {
    const t = await provision();
    const results = await Promise.all(
      [1, 2, 3, 4].map((i) =>
        call('POST', `/operator/tenants/${t.slug}/owner/transfer`, {
          expectedOwnerAccountId: t.ownerAccountId,
          newOwner: identity(`race-${String(i)}-${randomUUID()}`),
          reason: REASON,
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409]);
    const { rows } = await adminQuery<{ n: number }>(
      adminUrl,
      `SELECT count(*)::int AS n FROM app.memberships m JOIN app.tenants t ON t.id = m.tenant_id
       WHERE t.slug = $1 AND m.status = 'active'`,
      [t.slug],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('concurrent deactivate vs tenant reactivation never leaves an active tenant with an inactive owner', async () => {
    for (let round = 0; round < 5; round += 1) {
      const t = await provision();
      await call('POST', `/operator/tenants/${t.slug}/status`, {
        expectedStatus: 'active',
        status: 'suspended',
        reason: REASON,
      });
      await Promise.all([
        call('POST', `/operator/accounts/${t.ownerAccountId}/status`, {
          expectedStatus: 'active',
          status: 'deactivated',
          reason: REASON,
        }),
        call('POST', `/operator/tenants/${t.slug}/status`, {
          expectedStatus: 'suspended',
          status: 'active',
          reason: REASON,
        }),
      ]);
      const { rows } = await adminQuery<{ bad: number }>(
        adminUrl,
        `SELECT count(*)::int AS bad FROM app.tenants t
         JOIN app.memberships m ON m.tenant_id = t.id AND m.status = 'active'
         JOIN app.accounts a ON a.id = m.account_id
         WHERE t.slug = $1 AND t.status = 'active' AND a.status <> 'active'`,
        [t.slug],
      );
      expect(rows[0]?.bad).toBe(0);
    }
  });

  it('the database forbids two active owners even when written directly (E-10)', async () => {
    const t = await provision();
    const second = await seedAccount(adminUrl);
    await expect(
      adminQuery(
        adminUrl,
        `INSERT INTO app.memberships (tenant_id, account_id) SELECT id, $2 FROM app.tenants WHERE slug = $1`,
        [t.slug, second],
      ),
    ).rejects.toThrow(/memberships_one_active_owner/);
  });
});

describe('operator identity is derived from the session (B-03)', () => {
  it("the audit row names the session's operator account; there is no operator-id parameter", async () => {
    const operationId = randomUUID();
    const s = slug('b03');
    const res = await call('POST', '/operator/tenants', {
      slug: s,
      displayName: 'B03',
      owner: identity(`b03-${randomUUID()}`),
      reason: REASON,
      operationId,
    });
    expect(res.status).toBe(201);
    const [row] = await auditRows(operationId);
    expect(row).toMatchObject({ action: 'tenant.provision', operator_account: operator.accountId });
    expect(row?.operator_session).not.toBeNull();
  });

  it('the operator credential alone cannot act: a forged or non-operator session hash is refused', async () => {
    const ownerAccount = await seedAccount(adminUrl);
    const ownerToken = await seedSession(adminUrl, ownerAccount, 'owner');
    for (const hash of [tokenHash('forged-token-that-was-never-issued'), tokenHash(ownerToken)]) {
      await expect(
        asRole(
          operatorUrl,
          `SELECT * FROM app.operator_provision_tenant($1, gen_random_uuid(), $2, $3, 'X',
             'https://owners.idp.test', 'forged')`,
          [hash, REASON, slug('forged')],
        ),
      ).rejects.toThrow(/operator session not valid/);
    }
  });

  it('a revoked or expired operator session cannot act, even with the operator credential', async () => {
    const op = await seedOperator(adminUrl);
    await adminQuery(
      adminUrl,
      `UPDATE app.sessions SET revoked_at = now(), revoked_reason = 'logout' WHERE token_hash = $1`,
      [tokenHash(op.token)],
    );
    expect((await call('GET', '/operator/session', undefined, op.token)).status).toBe(401);
    await expect(
      asRole(operatorUrl, `SELECT * FROM app.operator_get_tenant($1, 'x')`, [tokenHash(op.token)]),
    ).rejects.toThrow(/operator session not valid/);
  });
});

describe('operation ids and outcome accuracy (B-02)', () => {
  it('a retry with the same operation id never applies twice', async () => {
    const operationId = randomUUID();
    const t = await provision();
    const body = { expectedStatus: 'active', status: 'suspended', reason: REASON, operationId };
    expect((await call('POST', `/operator/tenants/${t.slug}/status`, body)).status).toBe(200);
    const again = await call('POST', `/operator/tenants/${t.slug}/status`, {
      ...body,
      expectedStatus: 'suspended',
      status: 'active',
    });
    expect(again.status).toBe(409);
    const detail = await call('GET', `/operator/tenants/${t.slug}`);
    expect(detail.body.status).toBe('suspended'); // the second change did not apply
    expect(await auditRows(operationId)).toHaveLength(1);
  });

  it('GET /operator/operations/:id reports applied and not-applied operations', async () => {
    const operationId = randomUUID();
    await call('POST', '/operator/tenants', {
      slug: slug('out'),
      displayName: 'Outcome',
      owner: identity(`o-${randomUUID()}`),
      reason: REASON,
      operationId,
    });
    expect((await call('GET', `/operator/operations/${operationId}`)).body).toEqual({
      operationId,
      applied: true,
      action: 'tenant.provision',
    });
    const unknown = randomUUID();
    expect((await call('GET', `/operator/operations/${unknown}`)).body).toEqual({
      operationId: unknown,
      applied: false,
      action: null,
    });
  });

  it('a rejected operation leaves no audit row and is reported as not applied', async () => {
    const operationId = randomUUID();
    const t = await provision();
    const res = await call('POST', `/operator/tenants/${t.slug}/status`, {
      expectedStatus: 'suspended',
      status: 'active',
      reason: REASON,
      operationId,
    });
    expect(res.status).toBe(409);
    expect(await auditRows(operationId)).toHaveLength(0);
  });
});

describe('input validation at the edge and in the database (B-07, B-08)', () => {
  it.each([
    ['a NUL character in the reason', { reason: 'bad\u0000reason here' }],
    ['a control character in the display name', { displayName: 'Bad\u0007Name' }],
    ['an http issuer', { owner: { issuer: 'http://owners.idp.test', subject: 'x' } }],
    [
      'an issuer with credentials',
      { owner: { issuer: 'https://u:p@owners.idp.test', subject: 'x' } },
    ],
    ['a reserved slug', { slug: 'admin' }],
    ['a whitespace-only reason', { reason: '              ' }],
  ])('refuses %s with 400 (never 500)', async (_name, override) => {
    const res = await call('POST', '/operator/tenants', {
      slug: slug('v'),
      displayName: 'Valid',
      owner: identity('v'),
      reason: REASON,
      ...override,
    });
    expect(res.status).toBe(400);
  });

  it('the database refuses a reserved slug and an http issuer even through the definer', async () => {
    await expect(
      adminQuery(adminUrl, "INSERT INTO app.tenants (slug, display_name) VALUES ('admin', 'x')"),
    ).rejects.toThrow(/tenants_slug_not_reserved/);
    await expect(
      adminQuery(
        adminUrl,
        "INSERT INTO app.accounts (issuer, subject, kind) VALUES ('http://x.test', 's', 'owner')",
      ),
    ).rejects.toThrow(/accounts_issuer_https/);
  });
});

describe('uncertain outcomes after a lost connection are reconciled, never "rejected" (B-02)', () => {
  // The service's mutation wrapper is exercised directly with the REAL operator database: the
  // first call commits the change and then fails exactly like a connection dropped before the
  // reply arrived; the second fails before anything reached the database.
  type Mutate = (
    principal: unknown,
    requestId: string | undefined,
    action: string,
    target: string,
    reason: string,
    operationId: string | undefined,
    call: (db: Db, op: string) => Promise<unknown>,
  ) => Promise<unknown>;
  const lostConnection = () =>
    Object.assign(new Error('Connection terminated unexpectedly'), { code: 'ECONNRESET' });

  it('a committed change whose reply was lost is logged as applied and answered with 503', async () => {
    const lines: string[] = [];
    Logger.overrideLogger(new JsonLogger({ level: 'info', sink: (l) => lines.push(l) }));
    const db = createDatabase({ connectionString: operatorUrl, maxConnections: 1 });
    try {
      const service = new OperatorTenantsService(db, OWNER_ISSUER);
      const mutate = (service as unknown as { mutate: Mutate }).mutate.bind(service);
      const principal = {
        kind: 'operator',
        accountId: operator.accountId,
        sessionId: 'x',
        sessionTokenHash: tokenHash(operator.token),
      };
      const s = slug('lost');
      const operationId = randomUUID();
      await expect(
        mutate(principal, 'req-1', 'tenant.provision', s, REASON, operationId, async (d, op) => {
          await sql`SELECT * FROM app.operator_provision_tenant(${tokenHash(operator.token)},
            ${op}::uuid, ${REASON}, ${s}, 'Lost Reply', ${OWNER_ISSUER}, ${`lost-${randomUUID()}`})`.execute(
            d,
          );
          throw lostConnection(); // committed, but the caller never saw the answer
        }),
      ).rejects.toThrow(ServiceUnavailableException);
      const result = lines
        .map((l) => JSON.parse(l) as Record<string, unknown>)
        .find((e) => e.operationId === operationId && e.phase === 'result');
      expect(result?.outcome).toBe('applied');
      expect(await auditRows(operationId)).toHaveLength(1);

      const second = randomUUID();
      await expect(
        mutate(principal, 'req-2', 'tenant.provision', s, REASON, second, () =>
          Promise.reject(lostConnection()),
        ),
      ).rejects.toThrow(ServiceUnavailableException);
      const notApplied = lines
        .map((l) => JSON.parse(l) as Record<string, unknown>)
        .find((e) => e.operationId === second && e.phase === 'result');
      expect(notApplied?.outcome).toBe('not_applied');
      expect(lines.join('\n')).not.toMatch(/"outcome":"rejected"[^\n]*lost/);
    } finally {
      await db.destroy();
      Logger.overrideLogger(false);
    }
  });
});
