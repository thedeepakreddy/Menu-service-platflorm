import { SignJWT, UnsecuredJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { createTestIssuer } from '../../../test/identity/test-issuer.ts';
import type { TestIssuer } from '../../../test/identity/test-issuer.ts';
import { bearerToken, createIdentityVerifier } from './identity-verifier.js';
import type { IdentityVerifier } from './identity-verifier.js';

let owners: TestIssuer;
let verifier: IdentityVerifier;
let mfaVerifier: IdentityVerifier;

beforeAll(async () => {
  owners = await createTestIssuer('https://owners.idp.test', 'owner-api');
  verifier = createIdentityVerifier({
    issuer: owners.issuer,
    audience: owners.audience,
    keys: owners.keys,
  });
  mfaVerifier = createIdentityVerifier({
    ...{ issuer: owners.issuer, audience: owners.audience, keys: owners.keys },
    requireMfa: true,
  });
});

describe('createIdentityVerifier (D-025)', () => {
  it('accepts a valid ES256 or RS256 token and returns issuer and subject only', async () => {
    for (const alg of ['ES256', 'RS256'] as const) {
      expect(await verifier.verify(await owners.token({ sub: 'owner-1' }, { alg }))).toEqual({
        issuer: 'https://owners.idp.test',
        subject: 'owner-1',
      });
    }
  });

  it.each([
    ['a wrong issuer', () => owners.token({ iss: 'https://evil.idp.test' })],
    ['a wrong audience', () => owners.token({ aud: 'operator-api' })],
    ['an expired token', () => owners.token({}, { expiresIn: '-2m' })],
    ['a not-yet-valid token', () => owners.token({}, { notBefore: '10m' })],
    ['a missing subject', () => owners.token({ sub: '' })],
  ])('rejects %s', async (_label, make) => {
    expect(await verifier.verify(await make())).toBeUndefined();
  });

  it('rejects a token signed by an unknown key', async () => {
    const other = await createTestIssuer(owners.issuer, owners.audience);
    expect(await verifier.verify(await other.token())).toBeUndefined();
  });

  it('rejects an unsigned (alg: none) token', async () => {
    const unsigned = new UnsecuredJWT({ sub: 'owner-1' })
      .setIssuer(owners.issuer)
      .setAudience(owners.audience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .encode();
    expect(await verifier.verify(unsigned)).toBeUndefined();
  });

  it('rejects an HMAC-signed token (no algorithm confusion)', async () => {
    const secret = new TextEncoder().encode('synthetic-hmac-secret-of-sufficient-length-000');
    const hs = await new SignJWT({ sub: 'owner-1' })
      .setProtectedHeader({ alg: 'HS256', kid: 'es' })
      .setIssuer(owners.issuer)
      .setAudience(owners.audience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret);
    expect(await verifier.verify(hs)).toBeUndefined();
  });

  it('rejects a token without iat (same key, only iat missing)', async () => {
    expect(await verifier.verify(await owners.token({}, { noIat: true }))).toBeUndefined();
    expect(await verifier.verify(await owners.token({}))).toBeDefined();
  });

  it('rejects garbage and over-long input without throwing', async () => {
    for (const junk of ['', 'abc', 'a.b.c', 'x'.repeat(9000)]) {
      expect(await verifier.verify(junk)).toBeUndefined();
    }
  });

  it('requires amr to contain mfa when configured (operators)', async () => {
    expect(await mfaVerifier.verify(await owners.token({ amr: ['pwd'] }))).toBeUndefined();
    expect(await mfaVerifier.verify(await owners.token())).toBeUndefined();
    expect(await mfaVerifier.verify(await owners.token({ amr: ['pwd', 'mfa'] }))).toBeDefined();
  });
});

describe('bearerToken', () => {
  it('extracts only a well-formed Bearer credential', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    for (const bad of [
      undefined,
      '',
      'bearer abc',
      'Basic abc',
      'Bearer',
      'Bearer a b',
      'Bearer  abc',
    ]) {
      expect(bearerToken(bad)).toBeUndefined();
    }
  });
});

describe('authentication age for the operator proof (D-033)', () => {
  const now = Math.floor(Date.now() / 1000);
  const proof = () =>
    createIdentityVerifier({
      issuer: owners.issuer,
      audience: owners.audience,
      keys: owners.keys,
      requireMfa: true,
      maxAuthAgeSeconds: 600,
      nowSeconds: () => now,
    });

  it('accepts a recent MFA authentication', async () => {
    expect(
      await proof().verify(await owners.token({ amr: ['mfa'], auth_time: now - 60 })),
    ).toBeDefined();
  });

  it.each([
    ['no auth_time', { amr: ['mfa'] }],
    ['an old authentication', { amr: ['mfa'], auth_time: now - 601 }],
    ['an auth_time in the future', { amr: ['mfa'], auth_time: now + 3600 }],
    ['a non-numeric auth_time', { amr: ['mfa'], auth_time: 'yesterday' }],
    ['a recent login without MFA', { amr: ['pwd'], auth_time: now - 60 }],
  ])('rejects %s', async (_label, claims) => {
    expect(await proof().verify(await owners.token(claims))).toBeUndefined();
  });
});
