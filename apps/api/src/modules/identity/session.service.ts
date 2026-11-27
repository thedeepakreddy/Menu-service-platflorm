import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';

import { withReadRetry } from '../../infrastructure/database/database.js';
import type { Db } from '../../infrastructure/database/database.js';
import { DATABASE } from '../../infrastructure/database/database.module.js';
import type { VerifiedLogin } from './login-verifier.js';

export type AccountKind = 'owner' | 'operator';

/**
 * The authenticated caller, attached to the request by OwnerGuard / OperatorGuard. The session
 * token hash identifies the server-side session; operator database functions derive the operator
 * from it (audit B-03). The token itself is never kept.
 */
export type Principal = {
  readonly kind: AccountKind;
  readonly accountId: string;
  readonly sessionId: string;
  readonly sessionTokenHash: Buffer;
};

declare module 'express' {
  interface Request {
    principal?: Principal;
  }
}

/** Opaque session tokens: 256 bits from the CSPRNG, base64url (43 characters). */
export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only this hash is stored (D-034): a database leak does not reveal usable tokens. */
export function sessionTokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'ascii').digest();
}

export type SessionPolicy = {
  /** Idle timeout in seconds (renewed on use, never past the absolute expiry). */
  idleSeconds: number;
};

export type CreatedSession = {
  token: string;
  sessionId: string;
  /** Seconds since epoch. */
  expiresAt: number;
};

export type ValidSession = {
  sessionId: string;
  accountId: string;
  /** Seconds since epoch (absolute expiry). */
  expiresAt: number;
};

/** Database errors that mean "this login cannot become a session" (no account, replay, expired). */
export const REFUSED_LOGIN_CODES = new Set(['PTA01', 'PTR01']);

/**
 * Revocable server-side sessions in PostgreSQL (E-03, D-034). Every validation reads the
 * database, so revocation is immediate on every API instance.
 */
@Injectable()
export class SessionService {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  /**
   * Creates a session for a verified login. `replaces` is the browser's previous session token,
   * if any: it is revoked in the same transaction (rotation; session fixation protection).
   */
  async create(
    kind: AccountKind,
    login: VerifiedLogin,
    policy: SessionPolicy,
    absoluteExpiresAt: number,
    replaces: string | undefined,
  ): Promise<CreatedSession> {
    const token = newSessionToken();
    const { rows } = await sql<{ session_id: string; absolute_expires_at: Date }>`
      SELECT session_id, absolute_expires_at FROM app.session_create(
        ${sessionTokenHash(token)}, ${login.idTokenHash},
        to_timestamp(${login.idTokenExpiresAt}), ${login.issuer}, ${login.subject}, ${kind},
        ${login.mfa}, to_timestamp(${login.authTime}), ${login.clientId},
        ${login.providerSessionId ?? null}, ${policy.idleSeconds},
        to_timestamp(${absoluteExpiresAt}),
        ${replaces === undefined ? null : sessionTokenHash(replaces)})
    `.execute(this.db);
    const row = rows[0];
    if (row === undefined) throw new Error('session_create returned no row');
    return {
      token,
      sessionId: row.session_id,
      expiresAt: Math.floor(row.absolute_expires_at.getTime() / 1000),
    };
  }

  /** The live session for this token and kind, or undefined. Idempotent: retried once. */
  async validate(token: string, kind: AccountKind): Promise<ValidSession | undefined> {
    const hash = sessionTokenHash(token);
    const { rows } = await withReadRetry(() =>
      sql<{ session_id: string; account_id: string; absolute_expires_at: Date }>`
        SELECT session_id, account_id, absolute_expires_at
        FROM app.session_validate(${hash}, ${kind})
      `.execute(this.db),
    );
    const row = rows[0];
    return row === undefined
      ? undefined
      : {
          sessionId: row.session_id,
          accountId: row.account_id,
          expiresAt: Math.floor(row.absolute_expires_at.getTime() / 1000),
        };
  }

  /** Revokes the session (logout). Idempotent. */
  async revoke(token: string): Promise<void> {
    await withReadRetry(() =>
      sql`SELECT app.session_revoke(${sessionTokenHash(token)})`.execute(this.db),
    );
  }
}
