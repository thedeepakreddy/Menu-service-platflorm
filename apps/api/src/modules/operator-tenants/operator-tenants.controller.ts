import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  provisionTenantRequestSchema,
  tenantSlugSchema,
  tenantStatusChangeRequestSchema,
} from '@platform/contracts';
import type { OperatorTenant } from '@platform/contracts';
import type { Request } from 'express';

import { OperatorGuard } from '../identity/index.js';
import { OperatorTenantsService } from './operator-tenants.service.js';

/**
 * Operator control plane for tenants (Phase 2 M2.4; Doc 01 §6, Doc 04 §3). Operator-only
 * (OperatorGuard: separate trust domain with MFA). Bodies are validated against the shared
 * contracts before anything reaches the database.
 */
@Controller('operator/tenants')
@UseGuards(OperatorGuard)
export class OperatorTenantsController {
  constructor(private readonly tenants: OperatorTenantsService) {}

  private operator(req: Request): string {
    const id = req.principal?.kind === 'operator' ? req.principal.accountId : undefined;
    if (id === undefined) throw new BadRequestException();
    return id;
  }

  @Post()
  @HttpCode(201)
  provision(@Body() body: unknown, @Req() req: Request): Promise<OperatorTenant> {
    const parsed = provisionTenantRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return this.tenants.provision(this.operator(req), parsed.data);
  }

  @Post(':slug/status')
  @HttpCode(200)
  changeStatus(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<OperatorTenant> {
    const parsedSlug = tenantSlugSchema.safeParse(slug);
    const parsed = tenantStatusChangeRequestSchema.safeParse(body);
    if (!parsedSlug.success || !parsed.success) throw new BadRequestException();
    return this.tenants.changeStatus(this.operator(req), parsedSlug.data, parsed.data);
  }
}
