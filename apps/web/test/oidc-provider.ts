// A strict local OpenID Connect provider for tests (M2.6). Real RS256 signatures; exact
// redirect-URI matching; mandatory S256 PKCE (verified); client authentication; single-use codes;
// nonce echo. `behaviour` lets a test make it misbehave. Test support only; never shipped.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, request as httpsRequest } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';

export type ProviderBehaviour = {
  amr: string[];
  authTimeOffsetSeconds: number;
  expiresIn: number;
  nonceOverride?: string;
  subject: string;
};

/** Fetch-compatible function (the subset openid-client's customFetch uses). */
export type TestFetch = (
  url: string,
  options?: { method?: string; headers?: Record<string, string>; body?: unknown },
) => Promise<Response>;

export type TestProvider = {
  issuer: string;
  /** PEM of the throwaway TLS certificate (for NODE_EXTRA_CA_CERTS in e2e). */
  certPem: string;
  /** Fetch that trusts only this provider's throwaway certificate; never follows redirects. */
  fetch: TestFetch;
  behaviour: ProviderBehaviour;
  /** Requests the provider saw at the token endpoint (for assertions). */
  tokenRequests: { pkceVerified: boolean; redirectUri: string | null; clientAuth: string }[];
  close(): Promise<void>;
};

type Grant = { challenge: string; nonce: string | null; redirectUri: string; used: boolean };

export async function startTestProvider(client: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  /** The API audience (ZITADEL: the project id), present in both tokens' aud. */
  apiAudience?: string;
  /** Fixed port (e2e); default: any free port. */
  port?: number;
}): Promise<TestProvider> {
  const apiAudience = client.apiAudience ?? 'platform-api';
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const grants = new Map<string, Grant>();
  const behaviour: ProviderBehaviour = {
    amr: ['pwd'],
    authTimeOffsetSeconds: -5,
    expiresIn: 300,
    subject: 'user-1',
  };
  const tokenRequests: TestProvider['tokenRequests'] = [];
  let issuer = '';

  // A throwaway self-signed certificate for 127.0.0.1, valid one day, never committed.
  const dir = mkdtempSync(join(tmpdir(), 'oidc-test-'));
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:prime256v1',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
      '-keyout',
      join(dir, 'key.pem'),
      '-out',
      join(dir, 'cert.pem'),
    ],
    { stdio: 'ignore' },
  );
  const tls = {
    key: readFileSync(join(dir, 'key.pem')),
    cert: readFileSync(join(dir, 'cert.pem')),
  };
  rmSync(dir, { recursive: true, force: true });

  const server = createServer(tls, (req, res) => {
    const url = new URL(req.url ?? '/', issuer);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === '/.well-known/openid-configuration') {
      json(200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/keys`,
        end_session_endpoint: `${issuer}/end_session`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      });
      return;
    }
    if (url.pathname === '/end_session') {
      const back = url.searchParams.get('post_logout_redirect_uri');
      if (
        back !== client.postLogoutRedirectUri ||
        url.searchParams.get('client_id') !== client.clientId
      ) {
        json(400, { error: 'invalid_request' });
        return;
      }
      res.writeHead(302, { location: back });
      res.end();
      return;
    }
    if (url.pathname === '/keys') {
      json(200, { keys: [jwk] });
      return;
    }
    if (url.pathname === '/authorize') {
      const q = url.searchParams;
      const challenge = q.get('code_challenge');
      if (
        q.get('client_id') !== client.clientId ||
        q.get('redirect_uri') !== client.redirectUri || // exact match only
        q.get('response_type') !== 'code' ||
        q.get('code_challenge_method') !== 'S256' ||
        challenge === null
      ) {
        json(400, { error: 'invalid_request' });
        return;
      }
      const code = randomBytes(16).toString('base64url');
      grants.set(code, {
        challenge,
        nonce: q.get('nonce'),
        redirectUri: client.redirectUri,
        used: false,
      });
      const back = new URL(client.redirectUri);
      back.searchParams.set('code', code);
      const state = q.get('state');
      if (state !== null) back.searchParams.set('state', state);
      back.searchParams.set('iss', issuer);
      res.writeHead(302, { location: back.href });
      res.end();
      return;
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      let raw = '';
      req.on('data', (c: Buffer) => (raw += c.toString()));
      req.on('end', () => {
        void (async () => {
          const form = new URLSearchParams(raw);
          const basic = req.headers.authorization?.startsWith('Basic ')
            ? Buffer.from(req.headers.authorization.slice(6), 'base64').toString()
            : undefined;
          const [id, secret] =
            basic !== undefined
              ? basic.split(':').map((p) => decodeURIComponent(p))
              : [form.get('client_id'), form.get('client_secret')];
          const grant = grants.get(form.get('code') ?? '');
          const verifier = form.get('code_verifier') ?? '';
          const pkceVerified =
            grant !== undefined &&
            createHash('sha256').update(verifier).digest('base64url') === grant.challenge;
          tokenRequests.push({
            pkceVerified,
            redirectUri: form.get('redirect_uri'),
            clientAuth: basic !== undefined ? 'basic' : 'post',
          });
          if (id !== client.clientId || secret !== client.clientSecret) {
            json(401, { error: 'invalid_client' });
            return;
          }
          if (
            grant === undefined ||
            grant.used ||
            form.get('redirect_uri') !== grant.redirectUri ||
            !pkceVerified
          ) {
            json(400, { error: 'invalid_grant' });
            return;
          }
          grant.used = true; // single use
          const now = Math.floor(Date.now() / 1000);
          // Token shapes follow ZITADEL's (docs/architecture/spikes/zitadel-token-contract.md):
          // both tokens' aud = [client, project]; the ID token has azp, nonce, at_hash, sid,
          // amr, auth_time; the JWT access token has client_id and jti only.
          const sign = (claims: Record<string, unknown>) =>
            new SignJWT(claims)
              .setProtectedHeader({ alg: 'RS256', kid: 'k1', typ: 'JWT' })
              .setIssuer(issuer)
              .setSubject(behaviour.subject)
              .setAudience([client.clientId, apiAudience])
              .setIssuedAt(now)
              .setExpirationTime(now + behaviour.expiresIn)
              .sign(privateKey);
          const accessToken = await sign({
            client_id: client.clientId,
            jti: randomBytes(8).toString('hex'),
          });
          const atHash = createHash('sha256')
            .update(accessToken)
            .digest()
            .subarray(0, 16)
            .toString('base64url');
          const idToken = await sign({
            nonce: behaviour.nonceOverride ?? grant.nonce,
            amr: behaviour.amr,
            auth_time: now + behaviour.authTimeOffsetSeconds,
            azp: client.clientId,
            client_id: client.clientId,
            at_hash: atHash,
            sid: 'test-sid',
          });
          json(200, {
            access_token: accessToken,
            id_token: idToken,
            token_type: 'Bearer',
            expires_in: behaviour.expiresIn,
          });
        })();
      });
      return;
    }
    json(404, { error: 'not_found' });
  });
  await new Promise<void>((resolve) => server.listen(client.port ?? 0, '127.0.0.1', resolve));
  issuer = `https://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const fetchTls: TestFetch = (url, options = {}) =>
    new Promise((resolve, reject) => {
      const raw = options.body;
      // openid-client sends form bodies as URLSearchParams or strings.
      const body =
        raw === undefined || raw === null
          ? undefined
          : typeof raw === 'string'
            ? raw
            : raw instanceof URLSearchParams
              ? raw.toString()
              : raw instanceof Uint8Array
                ? Buffer.from(raw)
                : undefined;
      if (raw !== undefined && raw !== null && body === undefined) {
        reject(new TypeError('unsupported request body in test fetch'));
        return;
      }
      const req = httpsRequest(
        url,
        { method: options.method ?? 'GET', headers: options.headers, ca: tls.cert },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const headers = new Headers();
            for (const [k, v] of Object.entries(res.headers)) {
              if (typeof v === 'string') headers.set(k, v);
              else if (Array.isArray(v)) for (const item of v) headers.append(k, item);
            }
            const status = res.statusCode ?? 500;
            resolve(
              new Response(status === 204 || status === 302 ? null : Buffer.concat(chunks), {
                status,
                headers,
              }),
            );
          });
        },
      );
      req.on('error', reject);
      if (body !== undefined) req.write(body);
      req.end();
    });
  return {
    issuer,
    certPem: tls.cert.toString(),
    fetch: fetchTls,
    behaviour,
    tokenRequests,
    close: () =>
      new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      ),
  };
}
