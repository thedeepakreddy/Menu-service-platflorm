// Authentication and authorization boundary against real PostgreSQL (Phase 2 M2.3; D-025, D-027).
// Real signatures from local test issuers, the real guards, account mapping and memberships.
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { errorEnvelopeSchema, ownerTenantSchema } from '@platform/contracts';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createTestIssuer } from '../../../test/identity/test-issuer.ts';
import type { TestIssuer } from '../../../test/identity/test-issuer.ts';
import { createApp } from '../../create-app.js';
import { createDatabase } from '../../infrastructure/database/database.js';
import { createIdentityVerifier } from './identity-verifier.js';

const { ownerUrl, runtimeUrl } = inject('database');

// Unique to this file (the database is shared by every db test file).
const T_ACTIVE = '3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a';
const T_OTHER = '3b3b3b3b-3b3b-4b3b-8b3b-3b3b3b3b3b3b';
const T_SUSPENDED = '3c3c3c3c-3c3c-4c3c-8c3c-3c3c3c3c3c3c';
const OWNER_A = '4a4a4a4a-4a4a-4a4a-8a4a-4a4a4a4a4a4a';
const OWNER_B = '4b4b4b4b-4b4b-4b4b-8b4b-4b4b4b4b4b4b';
const OWNER_REVOKED = '4c4c4c4c-4c4c-4c4c-8c4c-4c4c4c4c4c4c';
const OPERATOR = '4d4d4d4d-4d4d-4d4d-8d4d-4d4d4d4d4d4d';

let app: INestApplication;
let base: string;
let owners: TestIssuer;
let operators: TestIssuer;

beforeAll(async () => {
  owners = await createTestIssuer('https://owners.idp.test', 'platform-owner-api');
  operators = await createTestIssuer('https://operators.idp.test', 'platform-operator-api');
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  await owner.query(`
    INSERT INTO app.tenants (id, slug, display_name, status) VALUES
      ('${T_ACTIVE}', 'auth-active', 'Auth Active', 'active'),
      ('${T_OTHER}', 'auth-other', 'Auth Other', 'active'),
      ('${T_SUSPENDED}', 'auth-suspended', 'Auth Suspended', 'suspended');
    INSERT INTO app.accounts (id, issuer, subject, kind) VALUES
      ('${OWNER_A}', '${owners.issuer}', 'owner-a', 'owner'),
      ('${OWNER_B}', '${owners.issuer}', 'owner-b', 'owner'),
      ('${OWNER_REVOKED}', '${owners.issuer}', 'owner-revoked', 'owner'),
      ('${OPERATOR}', '${operators.issuer}', 'operator-1', 'operator');
    INSERT INTO app.memberships (tenant_id, account_id, status) VALUES
      ('${T_ACTIVE}', '${OWNER_A}', 'active'),
      ('${T_SUSPENDED}', '${OWNER_A}', 'active'),
      ('${T_OTHER}', '${OWNER_B}', 'active'),
      ('${T_ACTIVE}', '${OWNER_REVOKED}', 'revoked');
  `);
  await owner.end();
  app = await createApp({
    logger: false,
    database: createDatabase({ connectionString: runtimeUrl, maxConnections: 4 }),
    identity: {
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
    },
  });
  await app.listen(0, '127.0.0.1');
  const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
  base = `http://127.0.0.1:${String(port)}`;
});

afterAll(async () => {
  await app.close();
});

async function get(path: string, token?: string) {
  const res = await fetch(`${base}${path}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
  const body: unknown = await res.json();
  return { status: res.status, body };
}

describe('owner authorization (D-025, D-027)', () => {
  it('an owner reaches their own active tenant', async () => {
    const { status, body } = await get(
      '/owner/tenants/auth-active',
      await owners.token({ sub: 'owner-a' }),
    );
    expect(status).toBe(200);
    expect(ownerTenantSchema.parse(body)).toEqual({
      slug: 'auth-active',
      displayName: 'Auth Active',
      role: 'owner',
    });
    expect(JSON.stringify(body)).not.toContain(T_ACTIVE);
  });

  it.each([
    ["another owner's tenant", 'owner-a', 'auth-other'],
    ['a suspended tenant they belong to', 'owner-a', 'auth-suspended'],
    ['a tenant where their membership is revoked', 'owner-revoked', 'auth-active'],
    ['a tenant that does not exist', 'owner-a', 'no-such-tenant'],
  ])('denies %s with the same 404', async (_label, sub, slug) => {
    const { status, body } = await get(`/owner/tenants/${slug}`, await owners.token({ sub }));
    expect(status).toBe(404);
    expect(errorEnvelopeSchema.parse(body).error.code).toBe('NOT_FOUND');
  });
});

describe('authentication (D-025)', () => {
  it.each([
    ['no token', () => Promise.resolve(undefined)],
    ['an unknown identity (no account)', async () => owners.token({ sub: 'stranger' })],
    ['an expired token', async () => owners.token({ sub: 'owner-a' }, { expiresIn: '-2m' })],
    [
      'a token for the operator audience',
      async () => owners.token({ sub: 'owner-a', aud: operators.audience }),
    ],
    [
      'a token from another issuer for the same subject',
      async () => operators.token({ sub: 'owner-a' }),
    ],
    [
      'a forged signature',
      async () =>
        (await createTestIssuer(owners.issuer, owners.audience)).token({ sub: 'owner-a' }),
    ],
  ])('owner routes answer %s with 401', async (_label, make) => {
    const { status, body } = await get('/owner/tenants/auth-active', await make());
    expect(status).toBe(401);
    expect(errorEnvelopeSchema.parse(body).error.code).toBe('UNAUTHORIZED');
  });

  it('owner and operator are separate trust domains', async () => {
    const ownerToken = await owners.token({ sub: 'owner-a', amr: ['pwd', 'mfa'] });
    const operatorToken = await operators.token({ sub: 'operator-1', amr: ['pwd', 'mfa'] });
    expect((await get('/operator/session', ownerToken)).status).toBe(401);
    expect((await get('/owner/tenants/auth-active', operatorToken)).status).toBe(401);
    expect((await get('/operator/session', operatorToken)).status).toBe(200);
  });

  it('operators must have used MFA', async () => {
    const noMfa = await operators.token({ sub: 'operator-1', amr: ['pwd'] });
    expect((await get('/operator/session', noMfa)).status).toBe(401);
  });

  it('an operator identity mapped to an owner account kind is refused, and vice versa', async () => {
    // owner-a exists only as an owner account; a valid operator token with that subject fails.
    const crossKind = await operators.token({ sub: 'owner-a', amr: ['mfa'] });
    expect((await get('/operator/session', crossKind)).status).toBe(401);
  });
});

describe('unconfigured trust domains fail closed (D-025)', () => {
  it('without verifiers, owner and operator routes always answer 401', async () => {
    const bare = await createApp({
      logger: false,
      database: createDatabase({ connectionString: runtimeUrl, maxConnections: 1 }),
    });
    await bare.listen(0, '127.0.0.1');
    try {
      const { port } = (bare.getHttpServer() as Server).address() as AddressInfo;
      const token = await owners.token({ sub: 'owner-a' });
      for (const path of ['/owner/tenants/auth-active', '/operator/session']) {
        const res = await fetch(`http://127.0.0.1:${String(port)}${path}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        expect(res.status).toBe(401);
      }
    } finally {
      await bare.close();
    }
  });
});

// D-033: providers such as ZITADEL carry amr only in the ID token. The API then requires the
// access token AND the ID token as an authentication proof, for the same issuer and subject.
describe('operator MFA proven by the ID token (D-033)', () => {
  const WEB_CLIENT = 'operator-web-client';
  let proofApp: INestApplication;
  let proofBase: string;

  beforeAll(async () => {
    proofApp = await createApp({
      logger: false,
      database: createDatabase({ connectionString: runtimeUrl, maxConnections: 2 }),
      identity: {
        operator: createIdentityVerifier({
          issuer: operators.issuer,
          audience: operators.audience,
          keys: operators.keys,
        }),
        operatorProof: createIdentityVerifier({
          issuer: operators.issuer,
          audience: WEB_CLIENT,
          keys: operators.keys,
          requireMfa: true,
          maxAuthAgeSeconds: 3600,
        }),
      },
    });
    await proofApp.listen(0, '127.0.0.1');
    const { port } = (proofApp.getHttpServer() as Server).address() as AddressInfo;
    proofBase = `http://127.0.0.1:${String(port)}`;
  });

  afterAll(async () => {
    await proofApp.close();
  });

  const now = () => Math.floor(Date.now() / 1000);
  // Like ZITADEL: the access token has no amr.
  const access = (sub = 'operator-1') => operators.token({ sub });
  const idToken = (claims: Record<string, unknown> = {}) =>
    operators.token({
      sub: 'operator-1',
      aud: WEB_CLIENT,
      amr: ['pwd', 'otp', 'mfa'],
      auth_time: now() - 30,
      ...claims,
    });

  async function session(accessToken: string, proof?: string) {
    const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` };
    if (proof !== undefined) headers['x-authentication-proof'] = proof;
    return (await fetch(`${proofBase}/operator/session`, { headers })).status;
  }

  it('accepts an access token with a valid MFA proof for the same subject', async () => {
    expect(await session(await access(), await idToken())).toBe(200);
  });

  it.each([
    ['no proof', () => Promise.resolve(undefined)],
    ['a proof without MFA', () => idToken({ amr: ['pwd'] })],
    ['a proof for another subject', () => idToken({ sub: 'someone-else' })],
    ['a proof for another audience (the API audience)', () => idToken({ aud: operators.audience })],
    ['a stale authentication', () => idToken({ auth_time: now() - 7200 })],
    [
      'a proof from another issuer',
      () => owners.token({ sub: 'operator-1', aud: WEB_CLIENT, amr: ['mfa'], auth_time: now() }),
    ],
    ['the access token used as its own proof', () => access()],
  ])('refuses %s with 401', async (_label, makeProof) => {
    expect(await session(await access(), await makeProof())).toBe(401);
  });
});
