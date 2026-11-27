import { createHash, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { LoginDomainConfig } from './login-verifier.js';
import { SESSION_TOKEN_PATTERN, SessionService, sessionTokenHash } from './session.service.js';
import type { AccountKind, SessionPolicy } from './session.service.js';

/**
 * Authentication boundary (decision D-034).
 *
 * Owner and operator routes accept ONLY a server-side session: `Authorization: Session <token>`,
 * and only from the web BFF, which proves itself with `X-Platform-BFF-Credential`. Bearer JWTs and
 * the D-033 `X-Authentication-Proof` header are no longer accepted anywhere: identity tokens are
 * verified once, at login (`POST /auth/sessions`), and MFA freshness is a property of the
 * session (its absolute expiry is bounded by the MFA authentication time).
 *
 * Header handling is strict: each security header must appear exactly once (Node silently keeps
 * the first of duplicate `Authorization` headers, so duplicates are counted from the raw headers),
 * with an exact format and bounded size. Every failure is the same generic 401.
 */
export const BFF_CREDENTIAL_HEADER = 'x-platform-bff-credential';
export const IDENTITY = Symbol('IDENTITY');

export type IdentityDomainConfig = LoginDomainConfig & SessionPolicy;

export type IdentityConfig = {
  owner?: IdentityDomainConfig;
  operator?: IdentityDomainConfig;
  /** The shared secret the web BFF presents. Absent: every authenticated route fails closed. */
  bffCredential?: string;
};

const BFF_CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const SESSION_HEADER = /^Session ([A-Za-z0-9_-]{43})$/;

/** The value of a header that must occur exactly once; undefined if absent or repeated. */
export function singleHeader(req: Request, name: string): string | undefined {
  let value: string | undefined;
  let count = 0;
  const raw = req.rawHeaders;
  for (let i = 0; i + 1 < raw.length; i += 2) {
    if (raw[i]?.toLowerCase() === name) {
      count += 1;
      value = raw[i + 1];
    }
  }
  return count === 1 ? value : undefined;
}

/** Constant-time comparison of the presented BFF credential with the configured one. */
export function bffCredentialMatches(presented: string | undefined, expected: string | undefined) {
  if (presented === undefined || expected === undefined) return false;
  if (!BFF_CREDENTIAL_PATTERN.test(presented)) return false;
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** The session token from `Authorization: Session <token>`, or undefined (strict). */
export function sessionToken(req: Request): string | undefined {
  const header = singleHeader(req, 'authorization');
  if (header === undefined || header.length > 64) return undefined;
  const token = SESSION_HEADER.exec(header)?.[1];
  return token !== undefined && SESSION_TOKEN_PATTERN.test(token) ? token : undefined;
}

/** Requires the BFF credential (server-to-server calls from the web app only). */
@Injectable()
export class BffGuard implements CanActivate {
  constructor(@Inject(IDENTITY) private readonly identity: IdentityConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (
      !bffCredentialMatches(singleHeader(req, BFF_CREDENTIAL_HEADER), this.identity.bffCredential)
    )
      throw new UnauthorizedException();
    return true;
  }
}

abstract class SessionGuard implements CanActivate {
  protected abstract readonly kind: AccountKind;

  constructor(
    @Inject(IDENTITY) private readonly identity: IdentityConfig,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (this.identity[this.kind] === undefined) throw new UnauthorizedException();
    if (
      !bffCredentialMatches(singleHeader(req, BFF_CREDENTIAL_HEADER), this.identity.bffCredential)
    )
      throw new UnauthorizedException();
    const token = sessionToken(req);
    if (token === undefined) throw new UnauthorizedException();
    const session = await this.sessions.validate(token, this.kind);
    if (session === undefined) throw new UnauthorizedException();
    req.principal = {
      kind: this.kind,
      accountId: session.accountId,
      sessionId: session.sessionId,
      sessionTokenHash: sessionTokenHash(token),
    };
    return true;
  }
}

/** Requires a live owner session (BFF only). */
@Injectable()
export class OwnerGuard extends SessionGuard {
  protected readonly kind = 'owner';
}

/** Requires a live operator session, which by construction is MFA-backed and fresh (D-034). */
@Injectable()
export class OperatorGuard extends SessionGuard {
  protected readonly kind = 'operator';
}
