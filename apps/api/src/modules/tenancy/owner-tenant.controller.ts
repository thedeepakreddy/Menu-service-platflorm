import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import type { OwnerTenant } from '@platform/contracts';
import type { Request } from 'express';

import { OwnerGuard } from '../identity/index.js';
import { TenancyService } from './tenancy.service.js';

/**
 * `GET /owner/tenants/:slug`: the authenticated owner's view of one of their tenants. The URL names
 * the tenant, but access comes only from a verified membership (D-027, Doc 04 §3). A tenant the
 * caller is not a member of is reported as not found, exactly like a tenant that does not exist,
 * so the response reveals nothing about other tenants (Doc 04 §20).
 */
@Controller('owner/tenants')
@UseGuards(OwnerGuard)
export class OwnerTenantController {
  constructor(private readonly tenancy: TenancyService) {}

  @Get(':slug')
  async get(@Param('slug') slug: string, @Req() req: Request): Promise<OwnerTenant> {
    const accountId = req.principal?.accountId;
    if (accountId === undefined) throw new NotFoundException();
    const tenant = await this.tenancy.ownerTenant(accountId, slug);
    if (tenant === undefined) throw new NotFoundException();
    return { slug: tenant.slug, displayName: tenant.displayName, role: 'owner' };
  }
}
