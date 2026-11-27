// Server-side sessions and the authentication boundary, end to end over HTTP against real
// PostgreSQL (D-034; audit C-01, C-02, C-05, E-03).
import { createHash } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import {
  createIdps,
  identityConfig,
  OPERATOR_API,
  OPERATOR_CLIENT,
  OPERATOR_ISSUER,
  OWNER_API,
  OWNER_CLIENT,
  OWNER_ISSUER,
  startTestApp,
} from '../../../test/db/app.js';
import type { TestApp, TestIdps } from '../../../test/db/app.js';
import {
  adminQuery,
  bffHeaders,
  seedAccount,
  seedTenant,
  TEST_BFF_CREDENTIAL,
} from '../../../test/db/fixtures.js';

const { adminUrl, runtimeUrl, operatorUrl } = inject('database');

let idps: TestIdps;
let api: TestApp;
let api2: TestApp;
let tenant: { slug: string; accountId: string };
const ownerSubject = 'owner-sessions-1';
const operatorSubject = 'operator-sessions-1';

beforeAll(async () => {
  idps = await createIdps();
  const identity = identityConfig(idps);
  api = await startTestApp({ runtimeUrl, operatorUrl, identity });
  // A second API instance on the same database (multi-instance consistency).
  api2 = await startTestApp({ runtimeUrl, operatorUrl, identity });
  const owner = await seedAccount(adminUrl, { issuer: OWNER_ISSUER, subject: ownerSubject });
  tenant = await seedTenant(adminUrl, { owner });
  await seedAccount(adminUrl, {
    issuer: OPERATOR_ISSUER,
    subject: operatorSubject,
    kind: 'operator',
  });
});

afterAll(async () => {
  await api.close();
  await api2.close();
});

const ownerLogin = (extra = {}) =>
  idps.owner.login({
    clientId: OWNER_CLIENT,
    apiAudience: OWNER_API,
    subject: ownerSubject,
    ...extra,
  });
const operatorLogin = (extra = {}) =>
  idps.operator.login({
    clientId: OPERATOR_CLIENT,
    apiAudience: OPERATOR_API,
    subject: operatorSubject,
    amr: ['pwd', 'otp', 'mfa'],
    ...extra,
  });

async function createSession(
  kind: 'owner' | 'operator',
  tokens: { idToken: string; accessToken: string },
  headers: Record<string, string> = bffHeaders(),
  replaces?: string,
) {
  const res = await fetch(`${api.url}/auth/sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind, ...tokens, ...(replaces === undefined ? {} : { replaces }) }),
  });
  const body =
    res.status === 201
      ? ((await res.json()) as { sessionToken: string; expiresAt: number })
      : undefined;
  return { status: res.status, body };
}

const ownerTenant = (
  session: string,
  base = api.url,
  headers: Record<string, string> = bffHeaders(session),
) => fetch(`${base}/owner/tenants/${tenant.slug}`, { headers }).then((r) => r.status);
const operatorSession = (session: string, headers: Record<string, string> = bffHeaders(session)) =>
  fetch(`${api.url}/operator/session`, { headers }).then((r) => r.status);

describe('POST /auth/sessions: login to server-side session', () => {
  it('creates an opaque session for a verified owner login; the session authorises owner routes', async () => {
    const { status, body } = await createSession('owner', await ownerLogin());
    expect(status).toBe(201);
    expect(body?.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await ownerTenant(body?.sessionToken ?? '')).toBe(200);
  });

  it('stores only the SHA-256 of the token, never the token', async () => {
    const { body } = await createSession('owner', await ownerLogin());
    const token = body?.sessionToken ?? '';
    const hash = createHash('sha256').update(token).digest();
    const { rows } = await adminQuery<{ n: number; dump: string }>(
      adminUrl,
      "SELECT count(*)::int AS n, string_agg(s::text, '') AS dump FROM app.sessions s WHERE token_hash = $1",
      [hash],
    );
    expect(rows[0]?.n).toBe(1);
    expect(rows[0]?.dump).not.toContain(token);
  });

  it.each([
    ['no BFF credential', { 'content-type': 'application/json' }],
    ['a wrong BFF credential', { ...bffHeaders(), 'x-platform-bff-credential': 'x'.repeat(43) }],
  ])('refuses %s', async (_name, headers) => {
    expect((await createSession('owner', await ownerLogin(), headers)).status).toBe(401);
  });

  it('refuses a duplicated BFF credential header', async () => {
    const res = await fetch(`${api.url}/auth/sessions`, {
      method: 'POST',
      headers: [
        ['content-type', 'application/json'],
        ['x-platform-bff-credential', TEST_BFF_CREDENTIAL],
        ['x-platform-bff-credential', TEST_BFF_CREDENTIAL],
      ],
      body: JSON.stringify({ kind: 'owner', ...(await ownerLogin()) }),
    });
    expect(res.status).toBe(401);
  });

  it('replay: the same ID token can create one session only', async () => {
    const tokens = await ownerLogin();
    expect((await createSession('owner', tokens)).status).toBe(201);
    expect((await createSession('owner', tokens)).status).toBe(401);
  });

  it('refuses an unknown identity and a deactivated account', async () => {
    expect((await createSession('owner', await ownerLogin({ subject: 'nobody' }))).status).toBe(
      401,
    );
    const subject = 'deactivated-owner';
    await seedAccount(adminUrl, { issuer: OWNER_ISSUER, subject, status: 'deactivated' });
    expect((await createSession('owner', await ownerLogin({ subject }))).status).toBe(401);
  });

  it('refuses an owner identity logging in as an operator, and vice versa', async () => {
    const asOperator = await idps.operator.login({
      clientId: OPERATOR_CLIENT,
      apiAudience: OPERATOR_API,
      subject: ownerSubject,
      amr: ['mfa'],
    });
    expect((await createSession('operator', asOperator)).status).toBe(401);
    expect((await createSession('owner', await operatorLogin())).status).toBe(401);
  });

  it('refuses a malformed body (not JSON, urlencoded, unknown keys, oversize)', async () => {
    const tokens = await ownerLogin();
    const urlencoded = await fetch(`${api.url}/auth/sessions`, {
      method: 'POST',
      headers: { ...bffHeaders(), 'content-type': 'application/x-www-form-urlencoded' },
      body: `kind=owner&idToken=${tokens.idToken}&accessToken=${tokens.accessToken}`,
    });
    expect(urlencoded.status).toBe(400);
    const extra = await fetch(`${api.url}/auth/sessions`, {
      method: 'POST',
      headers: bffHeaders(),
      body: JSON.stringify({ kind: 'owner', ...tokens, admin: true }),
    });
    expect(extra.status).toBe(400);
    const huge = await fetch(`${api.url}/auth/sessions`, {
      method: 'POST',
      headers: bffHeaders(),
      body: JSON.stringify({ kind: 'owner', idToken: 'a'.repeat(40_000), accessToken: 'b' }),
    });
    expect(huge.status).toBe(413);
  });
});

describe('C-01 end to end: one ID token can never be both credentials', () => {
  it('refuses a session built from the ID token as the access token', async () => {
    const { idToken } = await operatorLogin();
    expect((await createSession('operator', { idToken, accessToken: idToken })).status).toBe(401);
  });

  it('the D-033 headers (Bearer ID token + X-Authentication-Proof) no longer authenticate anything', async () => {
    const { idToken } = await operatorLogin();
    const headers = {
      ...bffHeaders(),
      authorization: `Bearer ${idToken}`,
      'x-authentication-proof': idToken,
    };
    expect(await operatorSession('', headers)).toBe(401);
    const tenants = await fetch(`${api.url}/operator/tenants`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    expect(tenants.status).toBe(401);
  });

  it("refuses an MFA ID token paired with another login's access token (C-02)", async () => {
    const mfa = await operatorLogin();
    const plain = await operatorLogin({ amr: ['pwd'] });
    expect(
      (await createSession('operator', { idToken: mfa.idToken, accessToken: plain.accessToken }))
        .status,
    ).toBe(401);
  });
});

describe('operator sessions: MFA is a property of the session (D-034)', () => {
  it('refuses an operator login without MFA', async () => {
    expect((await createSession('operator', await operatorLogin({ amr: ['pwd'] }))).status).toBe(
      401,
    );
  });

  it('an MFA operator session expires no later than auth_time + the maximum MFA age', async () => {
    const authTime = Math.floor(Date.now() / 1000) - 3000;
    const { status, body } = await createSession('operator', await operatorLogin({ authTime }));
    expect(status).toBe(201);
    expect(body?.expiresAt).toBeLessThanOrEqual(authTime + 3600);
    expect(await operatorSession(body?.sessionToken ?? '')).toBe(200);
  });

  it('the database itself refuses an operator session without MFA (downgrade protection)', async () => {
    const account = await seedAccount(adminUrl, { kind: 'operator', issuer: 'https://ops.test' });
    await expect(
      adminQuery(
        adminUrl,
        `INSERT INTO app.sessions (token_hash, account_id, kind, mfa, auth_time, client_id,
           idle_timeout, idle_expires_at, absolute_expires_at)
         VALUES (sha256('x'::bytea), $1, 'operator', false, now(), 'c', '15 minutes',
                 now() + interval '10 minutes', now() + interval '30 minutes')`,
        [account],
      ),
    ).rejects.toThrow(/sessions_operator_mfa/);
  });

  it('kinds never cross: an owner session is refused on operator routes and vice versa', async () => {
    const owner = (await createSession('owner', await ownerLogin())).body?.sessionToken ?? '';
    const op = (await createSession('operator', await operatorLogin())).body?.sessionToken ?? '';
    expect(await operatorSession(owner)).toBe(401);
    expect(await ownerTenant(op)).toBe(401);
  });
});

describe('revocation is immediate and consistent across instances (E-03, C-05)', () => {
  it('logout revokes the session; the old token can never be reused, on any instance', async () => {
    const token = (await createSession('owner', await ownerLogin())).body?.sessionToken ?? '';
    expect(await ownerTenant(token, api.url)).toBe(200);
    expect(await ownerTenant(token, api2.url)).toBe(200);
    const out = await fetch(`${api.url}/auth/sessions/current`, {
      method: 'DELETE',
      headers: bffHeaders(token),
    });
    expect(out.status).toBe(204);
    expect(await ownerTenant(token, api.url)).toBe(401);
    expect(await ownerTenant(token, api2.url)).toBe(401); // the other instance agrees at once
    const current = await fetch(`${api2.url}/auth/sessions/current/owner`, {
      headers: bffHeaders(token),
    });
    expect(current.status).toBe(401);
  });

  it("rotation: a new login replacing the browser's session revokes the old one (fixation)", async () => {
    const old = (await createSession('owner', await ownerLogin())).body?.sessionToken ?? '';
    const fresh = await createSession('owner', await ownerLogin(), bffHeaders(), old);
    expect(fresh.status).toBe(201);
    expect(fresh.body?.sessionToken).not.toBe(old);
    expect(await ownerTenant(old)).toBe(401);
    expect(await ownerTenant(fresh.body?.sessionToken ?? '')).toBe(200);
    const { rows } = await adminQuery<{ reason: string }>(
      adminUrl,
      'SELECT revoked_reason AS reason FROM app.sessions WHERE token_hash = $1',
      [createHash('sha256').update(old).digest()],
    );
    expect(rows[0]?.reason).toBe('rotated');
  });

  it('an idle-expired or absolutely-expired session is refused', async () => {
    const idle = (await createSession('owner', await ownerLogin())).body?.sessionToken ?? '';
    const absolute = (await createSession('owner', await ownerLogin())).body?.sessionToken ?? '';
    await adminQuery(
      adminUrl,
      `UPDATE app.sessions SET idle_expires_at = now() - interval '1 second' WHERE token_hash = $1`,
      [createHash('sha256').update(idle).digest()],
    );
    await adminQuery(
      adminUrl,
      `UPDATE app.sessions SET created_at = now() - interval '2 hours', auth_time = now() - interval '2 hours',
              idle_expires_at = now() - interval '1 second', absolute_expires_at = now() - interval '1 second'
       WHERE token_hash = $1`,
      [createHash('sha256').update(absolute).digest()],
    );
    expect(await ownerTenant(idle)).toBe(401);
    expect(await ownerTenant(absolute)).toBe(401);
  });

  it('use renews the idle expiry, never past the absolute expiry', async () => {
    const token = (await createSession('owner', await ownerLogin())).body?.sessionToken ?? '';
    const hash = createHash('sha256').update(token).digest();
    await adminQuery(
      adminUrl,
      `UPDATE app.sessions SET last_seen_at = now() - interval '5 minutes',
              idle_expires_at = now() + interval '1 minute' WHERE token_hash = $1`,
      [hash],
    );
    expect(await ownerTenant(token)).toBe(200);
    const { rows } = await adminQuery<{ idle: Date; abs: Date }>(
      adminUrl,
      'SELECT idle_expires_at AS idle, absolute_expires_at AS abs FROM app.sessions WHERE token_hash = $1',
      [hash],
    );
    // Renewed from +1 min to min(now + idle timeout, absolute). The test access token lives 5 min,
    // so the absolute expiry (bounded by the access token) is the cap here.
    const idle = rows[0]?.idle.getTime() ?? 0;
    expect(idle).toBeGreaterThan(Date.now() + 2 * 60_000);
    expect(idle).toBe(rows[0]?.abs.getTime());
  });
});

describe('strict header handling', () => {
  it.each([
    ['a lowercase scheme', (t: string) => ({ ...bffHeaders(), authorization: `session ${t}` })],
    ['a Bearer scheme', (t: string) => ({ ...bffHeaders(), authorization: `Bearer ${t}` })],
    ['trailing junk', (t: string) => ({ ...bffHeaders(), authorization: `Session ${t} x` })],
    ['no BFF credential', (t: string) => ({ authorization: `Session ${t}` })],
  ])('refuses %s', async (_name, headers) => {
    const token = (await createSession('owner', await ownerLogin())).body?.sessionToken ?? '';
    expect(await ownerTenant(token, api.url, headers(token))).toBe(401);
  });

  it('refuses a duplicated Authorization header (Node would silently keep the first)', async () => {
    const token = (await createSession('owner', await ownerLogin())).body?.sessionToken ?? '';
    const res = await fetch(`${api.url}/owner/tenants/${tenant.slug}`, {
      headers: [
        ['x-platform-bff-credential', TEST_BFF_CREDENTIAL],
        ['authorization', `Session ${token}`],
        ['authorization', `Session ${'A'.repeat(43)}`],
      ],
    });
    expect(res.status).toBe(401);
  });
});
