import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  accountStatusChangeRequestSchema,
  linkIdentityRequestSchema,
  provisionTenantRequestSchema,
  revokeOwnerRequestSchema,
  tenantSlugSchema,
  tenantStatusChangeRequestSchema,
  transferOwnershipRequestSchema,
  unlinkIdentityRequestSchema,
} from '@platform/contracts';
import type {
  AccountLifecycleResult,
  OperationOutcome,
  OperatorAccount,
  OperatorTenant,
  OperatorTenantDetail,
  OwnershipResult,
} from '@platform/contracts';
import type { Request } from 'express';
import { z } from 'zod';

import { OperatorGuard } from '../identity/index.js';
import type { Principal } from '../identity/index.js';
import { OperatorTenantsService } from './operator-tenants.service.js';

/**
 * Operator control plane (Phase 2 M2.4 and audit remediation; Doc 01 §6, Doc 04 §3). Operator-only
 * (`OperatorGuard`: a live, MFA-backed operator session through the BFF). Every path parameter and
 * body is validated against the shared contracts before anything reaches the database; rate
 * limiting (group `operator`) runs before all of it, as middleware.
 */

const accountIdSchema = z.uuid();

function operator(req: Request): Principal {
  const principal = req.principal;
  if (principal?.kind !== 'operator') throw new UnauthorizedException();
  return principal;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException();
  return parsed.data;
}

@Controller('operator/tenants')
@UseGuards(OperatorGuard)
export class OperatorTenantsController {
  constructor(private readonly operators: OperatorTenantsService) {}

  @Post()
  @HttpCode(201)
  provision(@Body() body: unknown, @Req() req: Request): Promise<OperatorTenant> {
    return this.operators.provision(
      operator(req),
      req.requestId,
      parse(provisionTenantRequestSchema, body),
    );
  }

  @Get(':slug')
  get(@Param('slug') slug: string, @Req() req: Request): Promise<OperatorTenantDetail> {
    return this.operators.tenant(operator(req), parse(tenantSlugSchema, slug));
  }

  @Post(':slug/status')
  @HttpCode(200)
  changeStatus(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<OperatorTenant> {
    return this.operators.changeStatus(
      operator(req),
      req.requestId,
      parse(tenantSlugSchema, slug),
      parse(tenantStatusChangeRequestSchema, body),
    );
  }

  @Post(':slug/owner/revoke')
  @HttpCode(200)
  revokeOwner(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<OwnershipResult> {
    return this.operators.revokeOwner(
      operator(req),
      req.requestId,
      parse(tenantSlugSchema, slug),
      parse(revokeOwnerRequestSchema, body),
    );
  }

  @Post(':slug/owner/transfer')
  @HttpCode(200)
  transferOwnership(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<OwnershipResult> {
    return this.operators.transferOwnership(
      operator(req),
      req.requestId,
      parse(tenantSlugSchema, slug),
      parse(transferOwnershipRequestSchema, body),
    );
  }
}

@Controller('operator/accounts')
@UseGuards(OperatorGuard)
export class OperatorAccountsController {
  constructor(private readonly operators: OperatorTenantsService) {}

  @Get(':accountId')
  get(@Param('accountId') accountId: string, @Req() req: Request): Promise<OperatorAccount> {
    return this.operators.account(operator(req), parse(accountIdSchema, accountId));
  }

  @Post(':accountId/status')
  @HttpCode(200)
  changeStatus(
    @Param('accountId') accountId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<AccountLifecycleResult> {
    return this.operators.setAccountStatus(
      operator(req),
      req.requestId,
      parse(accountIdSchema, accountId),
      parse(accountStatusChangeRequestSchema, body),
    );
  }

  @Post(':accountId/identity/unlink')
  @HttpCode(200)
  unlink(
    @Param('accountId') accountId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<AccountLifecycleResult> {
    return this.operators.unlinkIdentity(
      operator(req),
      req.requestId,
      parse(accountIdSchema, accountId),
      parse(unlinkIdentityRequestSchema, body),
    );
  }

  @Post(':accountId/identity/link')
  @HttpCode(200)
  link(
    @Param('accountId') accountId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<AccountLifecycleResult> {
    return this.operators.linkIdentity(
      operator(req),
      req.requestId,
      parse(accountIdSchema, accountId),
      parse(linkIdentityRequestSchema, body),
    );
  }
}

@Controller('operator/operations')
@UseGuards(OperatorGuard)
export class OperatorOperationsController {
  constructor(private readonly operators: OperatorTenantsService) {}

  @Get(':operationId')
  get(@Param('operationId') operationId: string, @Req() req: Request): Promise<OperationOutcome> {
    return this.operators.outcome(operator(req), parse(z.uuid(), operationId));
  }
}
