import { EncryptJWT, jwtDecrypt } from 'jose';

import type { LoginKind } from './config';

/**
 * Encrypted, authenticated cookies (D-033): the browser holds only ciphertext (JWE, dir +
 * A256GCM); its JavaScript cannot read them (HttpOnly); `__Host-` forces Secure, Path=/ and no
 * Domain (host-only). Tokens never reach browser JavaScript.
 */
export const SESSION_COOKIE = '__Host-platform-session';
export const LOGIN_COOKIE = '__Host-platform-login';

/** Browsers drop cookies over ~4096 bytes; refuse rather than silently lose the session. */
export const MAX_COOKIE_BYTES = 3800;

export type Session = {
  kind: LoginKind;
  issuer: string;
  subject: string;
  accessToken: string;
  idToken: string;
  /** Seconds since epoch. */
  expiresAt: number;
};

/** One login attempt: binds the callback to this browser (CSRF on login) and to PKCE. */
export type LoginTransaction = {
  kind: LoginKind;
  state: string;
  nonce: string;
  codeVerifier: string;
  expiresAt: number;
};

const ENC = { alg: 'dir', enc: 'A256GCM' } as const;

async function seal(
  payload: Record<string, unknown>,
  key: Uint8Array,
  expiresAt: number,
  purpose: string,
) {
  return new EncryptJWT({ ...payload, purpose })
    .setProtectedHeader(ENC)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .encrypt(key);
}

async function unseal(value: string | undefined, key: Uint8Array, purpose: string) {
  if (value === undefined || value.length === 0 || value.length > 8192) return undefined;
  try {
    const { payload } = await jwtDecrypt(value, key, {
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: ['A256GCM'],
    });
    // A login cookie can never be replayed as a session cookie, or vice versa.
    return payload.purpose === purpose ? payload : undefined;
  } catch {
    return undefined;
  }
}

export const sealSession = (s: Session, key: Uint8Array) => seal(s, key, s.expiresAt, 'session');
export const sealLogin = (t: LoginTransaction, key: Uint8Array) =>
  seal(t, key, t.expiresAt, 'login');

export async function openSession(
  value: string | undefined,
  key: Uint8Array,
): Promise<Session | undefined> {
  const p = await unseal(value, key, 'session');
  if (p === undefined) return undefined;
  const { kind, issuer, subject, accessToken, idToken, expiresAt } = p;
  if (
    (kind !== 'owner' && kind !== 'operator') ||
    typeof issuer !== 'string' ||
    typeof subject !== 'string' ||
    typeof accessToken !== 'string' ||
    typeof idToken !== 'string' ||
    typeof expiresAt !== 'number'
  ) {
    return undefined;
  }
  return { kind, issuer, subject, accessToken, idToken, expiresAt };
}

export async function openLogin(
  value: string | undefined,
  key: Uint8Array,
): Promise<LoginTransaction | undefined> {
  const p = await unseal(value, key, 'login');
  if (p === undefined) return undefined;
  const { kind, state, nonce, codeVerifier, expiresAt } = p;
  if (
    (kind !== 'owner' && kind !== 'operator') ||
    typeof state !== 'string' ||
    typeof nonce !== 'string' ||
    typeof codeVerifier !== 'string' ||
    typeof expiresAt !== 'number'
  ) {
    return undefined;
  }
  return { kind, state, nonce, codeVerifier, expiresAt };
}

/** Set-Cookie value. Always Secure, HttpOnly, SameSite=Lax, host-only, Path=/. */
export function cookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/; Max-Age=${String(Math.max(0, Math.floor(maxAgeSeconds)))}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookie(name: string): string {
  return cookie(name, '', 0);
}

/** Reads one cookie from a Cookie header. */
export function readCookie(header: string | null, name: string): string | undefined {
  if (header === null) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

/** Headers for a server-to-server API call on behalf of a session (D-030, D-033). */
export function apiAuthHeaders(session: Session): Record<string, string> {
  const headers: Record<string, string> = { authorization: `Bearer ${session.accessToken}` };
  // Operators: the ID token proves MFA (amr) for providers that keep it out of access tokens.
  if (session.kind === 'operator') headers['x-authentication-proof'] = session.idToken;
  return headers;
}
