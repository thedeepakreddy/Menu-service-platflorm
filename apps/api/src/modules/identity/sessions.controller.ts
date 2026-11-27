import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Logger,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { createSessionRequestSchema, loginKindSchema } from '@platform/contracts';
import type { CreateSessionResponse, CurrentSessionResponse } from '@platform/contracts';
import type { Request } from 'express';

import { BffGuard, IDENTITY, sessionToken } from './guards.js';
import type { IdentityConfig } from './guards.js';
import { ProviderUnavailableError, verifyLogin } from './login-verifier.js';
import { REFUSED_LOGIN_CODES, SessionService } from './session.service.js';

/** Absolute session ceilings (D-034); the database enforces the same ceilings again. */
const OWNER_MAX_SECONDS = 8 * 3600;
const OPERATOR_MAX_SECONDS = 3600;

/**
 * Server-side session lifecycle for the web BFF (decision D-034). BFF-only (`BffGuard`): the
 * browser never calls these routes and never sees identity tokens or session tokens.
 *
 * - `POST /auth/sessions`: the BFF has just completed an OIDC login; it hands over the ID token and
 *   access token ONCE. The API verifies both (login-verifier.ts), maps the identity to an active
 *   account of that kind, consumes the ID token (no replay) and returns a fresh opaque token.
 * - `GET /auth/sessions/current/:kind`: is the session (Authorization: Session) still live?
 * - `DELETE /auth/sessions/current`: logout; revokes the session immediately.
 */
@Controller('auth/sessions')
@UseGuards(BffGuard)
export class SessionsController {
  private readonly logger = new Logger('Sessions');

  constructor(
    @Inject(IDENTITY) private readonly identity: IdentityConfig,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown, @Req() req: Request): Promise<CreateSessionResponse> {
    const parsed = createSessionRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    const { kind, idToken, accessToken, replaces } = parsed.data;
    const domain = this.identity[kind];
    if (domain === undefined) throw new UnauthorizedException();
    const now = Math.floor(Date.now() / 1000);
    let login: Awaited<ReturnType<typeof verifyLogin>>;
    try {
      login = await verifyLogin({ idToken, accessToken }, domain, now);
    } catch (error) {
      if (error instanceof ProviderUnavailableError) {
        this.logger.warn({
          event: 'identity_provider_unavailable',
          kind,
          requestId: req.requestId,
        });
        throw new ServiceUnavailableException();
      }
      throw error;
    }
    if (login === undefined) {
      this.logger.log({
        event: 'session_refused',
        kind,
        reason: 'tokens',
        requestId: req.requestId,
      });
      throw new UnauthorizedException();
    }
    // The session never outlives the access token, the absolute ceiling, or (operators) the MFA
    // authentication's maximum age.
    const ceiling = kind === 'owner' ? OWNER_MAX_SECONDS : OPERATOR_MAX_SECONDS;
    let absolute = Math.min(now + ceiling, login.accessTokenExpiresAt);
    if (domain.mfaMaxAgeSeconds !== undefined) {
      absolute = Math.min(absolute, login.authTime + domain.mfaMaxAgeSeconds);
    }
    try {
      const created = await this.sessions.create(kind, login, domain, absolute, replaces);
      this.logger.log({
        event: 'session_created',
        kind,
        sessionId: created.sessionId,
        rotated: replaces !== undefined,
        requestId: req.requestId,
      });
      return { sessionToken: created.token, kind, expiresAt: created.expiresAt };
    } catch (error) {
      const code = (error as { code?: unknown } | undefined)?.code;
      if (typeof code === 'string' && REFUSED_LOGIN_CODES.has(code)) {
        // No account, deactivated account, replayed ID token or expiring login: same 401.
        this.logger.log({ event: 'session_refused', kind, reason: code, requestId: req.requestId });
        throw new UnauthorizedException();
      }
      throw error;
    }
  }

  @Get('current/:kind')
  async current(@Param('kind') kind: string, @Req() req: Request): Promise<CurrentSessionResponse> {
    const parsedKind = loginKindSchema.safeParse(kind);
    const token = sessionToken(req);
    if (!parsedKind.success || token === undefined) throw new UnauthorizedException();
    const session = await this.sessions.validate(token, parsedKind.data);
    if (session === undefined) throw new UnauthorizedException();
    return { kind: parsedKind.data, expiresAt: session.expiresAt };
  }

  @Delete('current')
  @HttpCode(204)
  async revoke(@Req() req: Request): Promise<void> {
    const token = sessionToken(req);
    if (token === undefined) return;
    await this.sessions.revoke(token);
    this.logger.log({ event: 'session_revoked', reason: 'logout', requestId: req.requestId });
  }
}
