import { EncryptJWT, jwtDecrypt } from 'jose';

import type { LoginKind } from './config';

/**
 * Cookies (D-034).
 *
 * - The SESSION cookie holds only `<kind>.<opaque token>`: 256 random bits issued by the API,
 *   which keeps the session server-side in PostgreSQL. No identity token, no claims, nothing
 *   decryptable: revocation at the API takes effect immediately.
 * - The LOGIN cookie seals one login transaction (state, nonce, PKCE verifier, a single-use id)
 *   for at most 10 minutes (JWE dir + A256GCM, key from WEB_SESSION_SECRET).
 *
 * Both are `__Host-` cookies: Secure, Path=/, no Domain (host-only), HttpOnly, SameSite=Lax.
 * Browser JavaScript can read neither.
 */
export const SESSION_COOKIE = '__Host-platform-session';
export const LOGIN_COOKIE = '__Host-platform-login';

/** One login attempt: binds the callback to this browser (login CSRF) and to PKCE. */
export type LoginTransaction = {
  /** Random id; each transaction can complete at most once (audit C-03). */
  id: string;
  kind: LoginKind;
  state: string;
  nonce: string;
  codeVerifier: string;
  expiresAt: number;
};

const ENC = { alg: 'dir', enc: 'A256GCM' } as const;
const SESSION_VALUE = /^(owner|operator)\.([A-Za-z0-9_-]{43})$/;

export type SessionCookie = { kind: LoginKind; token: string };

export function sessionCookieValue(kind: LoginKind, token: string): string {
  return `${kind}.${token}`;
}

/** Parses the session cookie strictly; anything else is "no session". */
export function parseSessionCookie(value: string | undefined): SessionCookie | undefined {
  if (value === undefined) return undefined;
  const match = SESSION_VALUE.exec(value);
  const kind = match?.[1];
  const token = match?.[2];
  return (kind === 'owner' || kind === 'operator') && token !== undefined
    ? { kind, token }
    : undefined;
}

export async function sealLogin(t: LoginTransaction, key: Uint8Array): Promise<string> {
  return new EncryptJWT({ ...t, purpose: 'login' })
    .setProtectedHeader(ENC)
    .setIssuedAt()
    .setExpirationTime(t.expiresAt)
    .encrypt(key);
}

export async function openLogin(
  value: string | undefined,
  key: Uint8Array,
): Promise<LoginTransaction | undefined> {
  if (value === undefined || value.length === 0 || value.length > 4096) return undefined;
  let p: Record<string, unknown>;
  try {
    ({ payload: p } = await jwtDecrypt(value, key, {
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: ['A256GCM'],
    }));
  } catch {
    return undefined;
  }
  const { id, kind, state, nonce, codeVerifier, expiresAt, purpose } = p;
  if (
    purpose !== 'login' ||
    typeof id !== 'string' ||
    (kind !== 'owner' && kind !== 'operator') ||
    typeof state !== 'string' ||
    typeof nonce !== 'string' ||
    typeof codeVerifier !== 'string' ||
    typeof expiresAt !== 'number'
  ) {
    return undefined;
  }
  return { id, kind, state, nonce, codeVerifier, expiresAt };
}

/** Set-Cookie value. Always Secure, HttpOnly, SameSite=Lax, host-only, Path=/. */
export function cookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/; Max-Age=${String(Math.max(0, Math.floor(maxAgeSeconds)))}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookie(name: string): string {
  return cookie(name, '', 0);
}

/** Reads one cookie from a Cookie header; a cookie present more than once is refused. */
export function readCookie(header: string | null, name: string): string | undefined {
  if (header === null) return undefined;
  let found: string | undefined;
  let count = 0;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) {
      count += 1;
      found = v.join('=');
    }
  }
  return count === 1 ? found : undefined;
}
