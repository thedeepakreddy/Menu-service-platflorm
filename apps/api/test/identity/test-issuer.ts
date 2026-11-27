// A local OIDC test issuer (D-025): real asymmetric keys and signatures, synthetic claims. Lets
// the identity boundary be verified without any vendor. Test support only; never shipped.
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';

export type TestIssuer = {
  issuer: string;
  audience: string;
  keys: JWTVerifyGetKey;
  /** Signs a token; `claims` and `options` override the valid defaults. */
  token(
    claims?: JWTPayload,
    options?: { expiresIn?: string; notBefore?: string; alg?: 'ES256' | 'RS256'; noIat?: boolean },
  ): Promise<string>;
};

export async function createTestIssuer(issuer: string, audience: string): Promise<TestIssuer> {
  const es = await generateKeyPair('ES256');
  const rs = await generateKeyPair('RS256');
  const esJwk = { ...(await exportJWK(es.publicKey)), kid: 'es', alg: 'ES256' };
  const rsJwk = { ...(await exportJWK(rs.publicKey)), kid: 'rs', alg: 'RS256' };
  return {
    issuer,
    audience,
    keys: createLocalJWKSet({ keys: [esJwk, rsJwk] }),
    async token(claims = {}, options = {}) {
      const alg = options.alg ?? 'ES256';
      let jwt = new SignJWT({ sub: 'subject-1', ...claims })
        .setProtectedHeader({ alg, kid: alg === 'ES256' ? 'es' : 'rs' })
        .setIssuer(typeof claims.iss === 'string' ? claims.iss : issuer)
        .setAudience(claims.aud ?? audience)
        .setExpirationTime(options.expiresIn ?? '5m');
      if (options.noIat !== true) jwt = jwt.setIssuedAt();
      if (options.notBefore !== undefined) jwt = jwt.setNotBefore(options.notBefore);
      return jwt.sign(alg === 'ES256' ? es.privateKey : rs.privateKey);
    },
  };
}
