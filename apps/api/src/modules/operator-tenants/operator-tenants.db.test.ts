// Operator tenant provisioning and lifecycle against real PostgreSQL (Phase 2 M2.4; D-027, D-028).
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { errorEnvelopeSchema, operatorTenantSchema } from '@platform/contracts';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createTestIssuer } from '../../../test/identity/test-issuer.ts';
import type { TestIssuer } from '../../../test/identity/test-issuer.ts';
import { createApp } from '../../create-app.js';
import { createDatabase } from '../../infrastructure/database/database.js';
import { JsonLogger } from '../../logging/json-logger.js';
import { createIdentityVerifier } from '../identity/index.js';
import type { IdentityConfig } from '../identity/index.js';

const { ownerUrl, runtimeUrl, operatorUrl } = inject('database');
const OPERATOR_ACCOUNT = '5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a';
const REASON = 'Onboarding ticket SYNTH-1001';
const OWNER_ISSUER = 'https://owners.lifecycle.test';
const OPERATOR_ISSUER = 'https://operators.lifecycle.test';

let app: INestApplication;
let base: string;
let owners: TestIssuer;
let operators: TestIssuer;
let identity: IdentityConfig;
let owner: pg.Client;
const logLines: string[] = [];

async function startApp(withOperatorDb: boolean) {
  const instance = await createApp({
    logger: new JsonLogger({ level: 'info', sink: (line) => logLines.push(line) }),
    database: createDatabase({ connectionString: runtimeUrl, maxConnections: 4 }),
    ...(withOperatorDb
      ? { operatorDatabase: createDatabase({ connectionString: operatorUrl, maxConnections: 4 }) }
      : {}),
    identity,
  });
  await instance.listen(0, '127.0.0.1');
  const { port } = (instance.getHttpServer() as Server).address() as AddressInfo;
  return { instance, url: `http://127.0.0.1:${String(port)}` };
}

beforeAll(async () => {
  owners = await createTestIssuer(OWNER_ISSUER, 'platform-owner-api');
  operators = await createTestIssuer(OPERATOR_ISSUER, 'platform-operator-api');
  identity = {
    owner: createIdentityVerifier({
      issuer: owners.issuer,
      audience: owners.audience,
      keys: owners.keys,
    }),
    operator: createIdentityVerifier({
      issuer: operators.issuer,
      audience: operators.audience,
      keys: operators.keys,
      requireMfa: true,
    }),
  };
  owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  await owner.query(
    "INSERT INTO app.accounts (id, issuer, subject, kind) VALUES ($1, $2, 'operator-1', 'operator')",
    [OPERATOR_ACCOUNT, operators.issuer],
  );
  ({ instance: app, url: base } = await startApp(true));
});

afterAll(async () => {
  await app.close();
  await owner.end();
});

const operatorToken = () => operators.token({ sub: 'operator-1', amr: ['pwd', 'mfa'] });

async function call(
  method: 'GET' | 'POST',
  path: string,
  token: string | undefined,
  body?: unknown,
  at = base,
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${at}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json: unknown = await res.json();
  return { status: res.status, body: json };
}

const provisionBody = (slug: string, subject: string) => ({
  slug,
  displayName: `Tenant ${slug}`,
  owner: { issuer: OWNER_ISSUER, subject },
  reason: REASON,
});

const auditRows = async (slug: string) =>
  (
    await owner.query<{ action: string; operator_id: string; reason: string }>(
      `SELECT a.action, a.operator_id, a.reason FROM app.operator_audit a
       JOIN app.tenants t ON t.id = a.target_tenant WHERE t.slug = $1 ORDER BY a.id`,
      [slug],
    )
  ).rows;

describe('provisioning (M2.4)', () => {
  it('creates tenant, owner account, membership and audit atomically; the owner can then sign in', async () => {
    const res = await call(
      'POST',
      '/operator/tenants',
      await operatorToken(),
      provisionBody('life-one', 'new-owner-1'),
    );
    expect(res.status).toBe(201);
    expect(operatorTenantSchema.parse(res.body)).toEqual({
      slug: 'life-one',
      displayName: 'Tenant life-one',
      status: 'active',
    });
    expect(await auditRows('life-one')).toEqual([
      { action: 'tenant.provision', operator_id: OPERATOR_ACCOUNT, reason: REASON },
    ]);
    expect((await call('GET', '/public/tenants/life-one', undefined)).status).toBe(200);
    const ownerView = await call(
      'GET',
      '/owner/tenants/life-one',
      await owners.token({ sub: 'new-owner-1' }),
    );
    expect(ownerView.status).toBe(200);
  });

  it('reuses an existing owner account for a second tenant', async () => {
    expect(
      (
        await call(
          'POST',
          '/operator/tenants',
          await operatorToken(),
          provisionBody('life-two', 'new-owner-1'),
        )
      ).status,
    ).toBe(201);
    const { rows } = await owner.query(
      "SELECT count(*)::int AS n FROM app.accounts WHERE issuer = $1 AND subject = 'new-owner-1'",
      [owners.issuer],
    );
    expect(rows[0]).toEqual({ n: 1 });
    expect(
      (await call('GET', '/owner/tenants/life-two', await owners.token({ sub: 'new-owner-1' })))
        .status,
    ).toBe(200);
  });

  it('refuses a taken slug with 409 and writes no audit row', async () => {
    const res = await call(
      'POST',
      '/operator/tenants',
      await operatorToken(),
      provisionBody('life-one', 'someone-else'),
    );
    expect(res.status).toBe(409);
    expect(await auditRows('life-one')).toHaveLength(1);
  });

  it('refuses an owner identity that belongs to an operator, leaving nothing behind', async () => {
    const body = {
      ...provisionBody('life-clash', 'operator-1'),
      owner: { issuer: OPERATOR_ISSUER, subject: 'operator-1' },
    };
    expect((await call('POST', '/operator/tenants', await operatorToken(), body)).status).toBe(409);
    const { rows } = await owner.query("SELECT 1 FROM app.tenants WHERE slug = 'life-clash'");
    expect(rows).toEqual([]);
  });

  it.each([
    ['a reserved slug', { ...provisionBody('admin', 'x') }],
    ['a malformed slug', { ...provisionBody('Bad_Slug', 'x') }],
    ['a short reason', { ...provisionBody('life-bad1', 'x'), reason: 'too short' }],
    ['an unknown field', { ...provisionBody('life-bad2', 'x'), status: 'active' }],
    [
      'a non-URL issuer',
      { ...provisionBody('life-bad3', 'x'), owner: { issuer: 'not a url', subject: 'x' } },
    ],
    ['a missing owner', { slug: 'life-bad4', displayName: 'x', reason: REASON }],
  ])('rejects %s with 400 before touching the database', async (_label, body) => {
    const res = await call('POST', '/operator/tenants', await operatorToken(), body);
    expect(res.status).toBe(400);
    expect(errorEnvelopeSchema.parse(res.body).error.code).toBe('BAD_REQUEST');
  });
});

describe('authorization of operator actions (D-025)', () => {
  it.each([
    ['no token', () => Promise.resolve(undefined)],
    ['an owner token', () => owners.token({ sub: 'new-owner-1', amr: ['mfa'] })],
    ['an operator token without MFA', () => operators.token({ sub: 'operator-1', amr: ['pwd'] })],
    [
      'an operator identity with no account',
      () => operators.token({ sub: 'unknown-op', amr: ['mfa'] }),
    ],
  ])('refuses %s with 401 and changes nothing', async (_label, make) => {
    const res = await call(
      'POST',
      '/operator/tenants',
      await make(),
      provisionBody('life-denied', 'x'),
    );
    expect(res.status).toBe(401);
    const { rows } = await owner.query("SELECT 1 FROM app.tenants WHERE slug = 'life-denied'");
    expect(rows).toEqual([]);
  });
});

describe('lifecycle transitions (M2.4)', () => {
  const change = async (slug: string, expectedStatus: string, status: string) =>
    call('POST', `/operator/tenants/${slug}/status`, await operatorToken(), {
      expectedStatus,
      status,
      reason: REASON,
    });

  it('suspension hides the tenant from the public and its owner; reactivation restores both', async () => {
    const ownerToken = await owners.token({ sub: 'new-owner-1' });
    expect((await change('life-one', 'active', 'suspended')).status).toBe(200);
    expect((await call('GET', '/public/tenants/life-one', undefined)).status).toBe(404);
    expect((await call('GET', '/owner/tenants/life-one', ownerToken)).status).toBe(404);
    const back = await change('life-one', 'suspended', 'active');
    expect(back.status).toBe(200);
    expect(operatorTenantSchema.parse(back.body).status).toBe('active');
    expect((await call('GET', '/public/tenants/life-one', undefined)).status).toBe(200);
    expect((await call('GET', '/owner/tenants/life-one', ownerToken)).status).toBe(200);
    expect((await auditRows('life-one')).map((r) => r.action)).toEqual([
      'tenant.provision',
      'tenant.status.active_to_suspended',
      'tenant.status.suspended_to_active',
    ]);
  });

  it('a stale expected status is a 409 conflict and changes nothing', async () => {
    expect((await change('life-one', 'suspended', 'active')).status).toBe(409);
    expect((await auditRows('life-one')).length).toBe(3);
  });

  it.each([
    ['active → active', 'active', 'active'],
    ['suspended → suspended', 'suspended', 'suspended'],
    ['retired → active', 'retired', 'active'],
    ['retired → suspended', 'retired', 'suspended'],
  ])('refuses the invalid transition %s with 422', async (_label, from, to) => {
    expect((await change('life-two', from, to)).status).toBe(422);
  });

  it('retirement is terminal and makes the tenant unreachable', async () => {
    expect((await change('life-two', 'active', 'retired')).status).toBe(200);
    expect((await change('life-two', 'retired', 'active')).status).toBe(422);
    expect((await call('GET', '/public/tenants/life-two', undefined)).status).toBe(404);
  });

  it('an unknown tenant is 404', async () => {
    expect((await change('life-missing', 'active', 'suspended')).status).toBe(404);
  });

  it('of 10 concurrent suspensions exactly one wins; the rest get 409 and no audit row', async () => {
    expect(
      (
        await call(
          'POST',
          '/operator/tenants',
          await operatorToken(),
          provisionBody('life-race', 'race-owner'),
        )
      ).status,
    ).toBe(201);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => change('life-race', 'active', 'suspended')),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409, 409, 409, 409, 409, 409, 409, 409]);
    expect((await auditRows('life-race')).map((r) => r.action)).toEqual([
      'tenant.provision',
      'tenant.status.active_to_suspended',
    ]);
  });
});

describe('audit trail outside the database transaction (D-028)', () => {
  it('logs an attempt and an outcome for applied and rejected actions, without tokens', () => {
    const entries = logLines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .filter((e) => e.event === 'operator_action');
    expect(entries.some((e) => e.phase === 'attempt' && e.action === 'tenant.provision')).toBe(
      true,
    );
    expect(entries.some((e) => e.phase === 'result' && e.outcome === 'applied')).toBe(true);
    expect(
      entries.some((e) => e.phase === 'result' && e.outcome === 'rejected' && e.code === 'PTC01'),
    ).toBe(true);
    expect(entries.every((e) => e.operatorAccountId === OPERATOR_ACCOUNT)).toBe(true);
    expect(logLines.join('\n')).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });
});

describe('fail closed and privilege separation (D-028)', () => {
  it('without the operator database credential, operator actions answer 503', async () => {
    const { instance, url } = await startApp(false);
    try {
      const res = await call(
        'POST',
        '/operator/tenants',
        await operatorToken(),
        provisionBody('life-noop', 'x'),
        url,
      );
      expect(res.status).toBe(503);
    } finally {
      await instance.close();
    }
  });

  it.each([
    [
      'the runtime role cannot provision',
      runtimeUrl,
      "SELECT * FROM app.operator_provision_tenant('x','reason long enough','life-x','X','https://i','s')",
    ],
    [
      'the runtime role cannot change status',
      runtimeUrl,
      "SELECT * FROM app.operator_set_tenant_status('x','reason long enough','life-one','active','suspended')",
    ],
    ['the operator role cannot read tenants directly', operatorUrl, 'SELECT * FROM app.tenants'],
    [
      'the operator role cannot write the audit table',
      operatorUrl,
      "INSERT INTO app.operator_audit (operator_id, action, reason) VALUES ('x','y','reason long enough')",
    ],
    [
      'the operator role cannot update tenants directly',
      operatorUrl,
      "UPDATE app.tenants SET status = 'active'",
    ],
  ])('%s', async (_label, url, statement) => {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      await expect(client.query(statement)).rejects.toThrow(/permission denied/);
    } finally {
      await client.end();
    }
  });
});
