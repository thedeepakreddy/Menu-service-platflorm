// Login verification (D-034): reproduces the audit's C-01/C-02 attacks and proves they fail.
import { errors, jwtVerify, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { createTestIssuer } from '../../../test/identity/test-issuer.js';
import type { TestIssuer } from '../../../test/identity/test-issuer.js';
import {
  MAX_ID_TOKEN_AGE_SECONDS,
  ProviderUnavailableError,
  verifyLogin,
} from './login-verifier.js';
import type { LoginDomainConfig } from './login-verifier.js';

const ISSUER = 'https://operators.idp.test';
const CLIENT = 'operator-web';
// ZITADEL: the API audience is the project id, which is ALSO in every ID token's aud.
const API_AUDIENCE = 'operator-project-id';

let idp: TestIssuer;
let config: LoginDomainConfig;
const now = () => Math.floor(Date.now() / 1000);

beforeAll(async () => {
  idp = await createTestIssuer(ISSUER, API_AUDIENCE);
  config = {
    issuer: ISSUER,
    apiAudience: API_AUDIENCE,
    clientId: CLIENT,
    keys: idp.keys,
    mfaMaxAgeSeconds: 3600,
  };
});

const mfaLogin = (extra: Partial<Parameters<TestIssuer['login']>[0]> = {}) =>
  idp.login({ clientId: CLIENT, apiAudience: API_AUDIENCE, amr: ['pwd', 'otp', 'mfa'], ...extra });

describe('verifyLogin: valid logins', () => {
  it('accepts a ZITADEL-shaped operator login with MFA', async () => {
    const login = await verifyLogin(await mfaLogin({ sid: 'S1' }), config, now());
    expect(login).toMatchObject({
      issuer: ISSUER,
      subject: 'subject-1',
      mfa: true,
      clientId: CLIENT,
      providerSessionId: 'S1',
    });
    expect(login?.idTokenHash).toHaveLength(32);
  });

  it('accepts ES256 tokens and an owner login without MFA when MFA is not required', async () => {
    const owner = { ...config, mfaMaxAgeSeconds: undefined };
    const tokens = await idp.login({ clientId: CLIENT, apiAudience: API_AUDIENCE, alg: 'ES256' });
    expect((await verifyLogin(tokens, owner, now()))?.mfa).toBe(false);
  });
});

describe('C-01: one ID token must never satisfy both credential roles', () => {
  it('PRECONDITION (the original defect): an audience-only check accepts the ID token as an access token', async () => {
    const { idToken } = await mfaLogin();
    // This is exactly what the D-033 access verifier did: iss + aud. It passes.
    await expect(
      jwtVerify(idToken, idp.keys, { issuer: ISSUER, audience: API_AUDIENCE }),
    ).resolves.toBeDefined();
  });

  it('refuses the same ID token presented as both tokens', async () => {
    const { idToken } = await mfaLogin();
    expect(await verifyLogin({ idToken, accessToken: idToken }, config, now())).toBeUndefined();
  });

  it('refuses an ID token as the access token next to another ID token', async () => {
    const a = await mfaLogin();
    const b = await mfaLogin();
    expect(
      await verifyLogin({ idToken: a.idToken, accessToken: b.idToken }, config, now()),
    ).toBeUndefined();
  });

  it.each(['nonce', 'at_hash', 'auth_time', 'amr'])(
    'refuses an access token that carries the ID-token claim %s',
    async (claim) => {
      const value = claim === 'amr' ? ['mfa'] : claim === 'auth_time' ? now() : 'x';
      const base = await mfaLogin({ accessClaims: { [claim]: value } });
      expect(await verifyLogin(base, config, now())).toBeUndefined();
    },
  );

  it('refuses an ID token without a nonce (an access token in the ID-token slot)', async () => {
    const tokens = await mfaLogin({ idClaims: { nonce: undefined } });
    expect(await verifyLogin(tokens, config, now())).toBeUndefined();
  });
});

describe('C-02: binding between the tokens, the client and the session', () => {
  it('refuses an MFA ID token from another login (at_hash mismatch: cross-session)', async () => {
    const mfa = await mfaLogin({ sid: 'S-NEW' });
    const plain = await idp.login({ clientId: CLIENT, apiAudience: API_AUDIENCE, sid: 'S-OLD' });
    expect(
      await verifyLogin({ idToken: mfa.idToken, accessToken: plain.accessToken }, config, now()),
    ).toBeUndefined();
  });

  it('refuses an ID token without at_hash', async () => {
    expect(
      await verifyLogin(await mfaLogin({ idClaims: { at_hash: undefined } }), config, now()),
    ).toBeUndefined();
  });

  it('refuses an ID token issued to another client of the same project (azp)', async () => {
    // ZITADEL puts every client of the project in aud, so aud contains ours; azp does not.
    const other = await idp.login({
      clientId: 'other-app',
      apiAudience: API_AUDIENCE,
      amr: ['mfa'],
      idClaims: { aud: ['other-app', CLIENT, API_AUDIENCE] },
    });
    expect(await verifyLogin(other, config, now())).toBeUndefined();
  });

  it('refuses an ID token whose authorized party is another client, even with a matching pair', async () => {
    // Only azp differs: aud contains our client and at_hash binds the (valid) access token.
    const tokens = await mfaLogin({ idClaims: { azp: 'other-app' } });
    expect(await verifyLogin(tokens, config, now())).toBeUndefined();
  });

  it('refuses an access token issued to another client', async () => {
    const tokens = await mfaLogin({ accessClaims: { client_id: 'other-app' } });
    expect(await verifyLogin(tokens, config, now())).toBeUndefined();
  });

  it('refuses an access token without the API audience', async () => {
    const tokens = await mfaLogin({ accessClaims: { aud: [CLIENT] } });
    expect(await verifyLogin(tokens, config, now())).toBeUndefined();
  });

  it('refuses tokens for different subjects', async () => {
    const tokens = await mfaLogin({ accessClaims: { sub: 'someone-else' } });
    expect(await verifyLogin(tokens, config, now())).toBeUndefined();
  });

  it('refuses an ID token whose aud lacks our client', async () => {
    const tokens = await mfaLogin({ idClaims: { aud: [API_AUDIENCE] } });
    expect(await verifyLogin(tokens, config, now())).toBeUndefined();
  });
});

describe('MFA semantics and freshness', () => {
  it.each([
    ['no amr', { amr: undefined }],
    ['amr without mfa', { amr: ['pwd', 'otp'] }],
    ['amr not an array', { amr: 'mfa' }],
  ])('refuses an operator login with %s (downgrade)', async (_name, idClaims) => {
    expect(await verifyLogin(await mfaLogin({ idClaims }), config, now())).toBeUndefined();
  });

  it('refuses an MFA authentication older than the maximum age', async () => {
    const tokens = await mfaLogin({ authTime: now() - 3601 });
    expect(await verifyLogin(tokens, config, now())).toBeUndefined();
  });

  it('accepts an MFA authentication exactly at the maximum age', async () => {
    const t = now();
    const tokens = await mfaLogin({ authTime: t - 3600 });
    expect(await verifyLogin(tokens, config, t)).toBeDefined();
  });

  it('refuses a missing or future auth_time', async () => {
    expect(
      await verifyLogin(await mfaLogin({ idClaims: { auth_time: undefined } }), config, now()),
    ).toBeUndefined();
    expect(
      await verifyLogin(await mfaLogin({ authTime: now() + 120 }), config, now()),
    ).toBeUndefined();
  });

  it('refuses an ID token older than the login window (replay of an old token)', async () => {
    const tokens = await mfaLogin();
    expect(await verifyLogin(tokens, config, now() + MAX_ID_TOKEN_AGE_SECONDS + 1)).toBeUndefined();
  });
});

describe('token hygiene', () => {
  it('refuses expired tokens, wrong issuer, and oversized tokens', async () => {
    const expired = await mfaLogin({ idClaims: { exp: now() - 120 } });
    expect(await verifyLogin(expired, config, now())).toBeUndefined();
    const wrongIss = await mfaLogin({ idClaims: { iss: 'https://evil.test' } });
    expect(await verifyLogin(wrongIss, config, now())).toBeUndefined();
    const big = await mfaLogin();
    expect(
      await verifyLogin({ ...big, accessToken: `${big.accessToken}${'A'.repeat(9000)}` }, config),
    ).toBeUndefined();
  });

  it('refuses HMAC-signed and unsigned tokens (no algorithm confusion)', async () => {
    const good = await mfaLogin();
    const hs = await new SignJWT({ sub: 'subject-1', aud: API_AUDIENCE, client_id: CLIENT })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('x'.repeat(32)));
    expect(await verifyLogin({ idToken: good.idToken, accessToken: hs }, config)).toBeUndefined();
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{}').toString('base64url')}.`;
    expect(
      await verifyLogin({ idToken: none, accessToken: good.accessToken }, config),
    ).toBeUndefined();
  });

  it('refuses an encrypted or non-JWT typ header', async () => {
    const tokens = await idp.login({ clientId: CLIENT, apiAudience: API_AUDIENCE, amr: ['mfa'] });
    const weird = await idp.token(
      { aud: API_AUDIENCE, client_id: CLIENT },
      { typ: 'logout+jwt', alg: 'RS256' },
    );
    expect(await verifyLogin({ ...tokens, accessToken: weird }, config)).toBeUndefined();
  });
});

describe('identity provider outages are 503-class, not "bad token" (audit C-04, review R2-09)', () => {
  it.each([
    [
      'a non-200 JWKS response',
      () => new errors.JOSEError('Expected 200 OK from the JSON Web Key Set HTTP response'),
    ],
    ['an unparseable JWKS', () => new errors.JWKSInvalid('JSON Web Key Set malformed')],
    ['a JWKS timeout', () => new errors.JWKSTimeout()],
    ['a refused connection', () => new TypeError('fetch failed')],
  ])('maps %s to ProviderUnavailableError', async (_name, failure) => {
    const broken = { ...config, keys: () => Promise.reject(failure()) };
    await expect(verifyLogin(await mfaLogin(), broken, now())).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });
});
