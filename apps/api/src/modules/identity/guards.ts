import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { bearerToken } from './identity-verifier.js';
import type { IdentityVerifier } from './identity-verifier.js';
import { AccountService } from './identity.service.js';
import type { AccountKind } from './identity.service.js';

/**
 * Trust domains (D-025). A missing verifier means that kind of identity is not configured: its
 * routes fail closed (401). Staging and production refuse to start without both (env.ts).
 */
export type IdentityConfig = { owner?: IdentityVerifier; operator?: IdentityVerifier };
export const IDENTITY = Symbol('IDENTITY');

abstract class PrincipalGuard implements CanActivate {
  protected abstract readonly kind: AccountKind;

  constructor(
    @Inject(IDENTITY) private readonly identity: IdentityConfig,
    @Inject(AccountService) private readonly accounts: AccountService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const verifier = this.identity[this.kind];
    const token = bearerToken(req.header('authorization'));
    // One generic 401 for every failure; nothing about which check failed reaches the client.
    if (verifier === undefined || token === undefined) throw new UnauthorizedException();
    const verified = await verifier.verify(token);
    if (verified === undefined) throw new UnauthorizedException();
    const accountId = await this.accounts.findAccount(verified, this.kind);
    if (accountId === undefined) throw new UnauthorizedException();
    req.principal = { kind: this.kind, accountId };
    return true;
  }
}

/** Requires a verified owner identity mapped to an owner account. */
@Injectable()
export class OwnerGuard extends PrincipalGuard {
  protected readonly kind = 'owner';
}

/** Requires a verified operator identity (with MFA) mapped to an operator account. */
@Injectable()
export class OperatorGuard extends PrincipalGuard {
  protected readonly kind = 'operator';
}
