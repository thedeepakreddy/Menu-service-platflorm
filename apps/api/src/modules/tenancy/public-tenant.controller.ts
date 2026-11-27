import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import type { PublicTenant } from '@platform/contracts';

import { TenancyService } from './tenancy.service.js';

/**
 * Public tenant entry (D-027, Doc 03 §3): `GET /public/tenants/:slug`. Every failure — malformed,
 * reserved, unknown, suspended or retired — is the same 404 NOT_FOUND envelope, so the endpoint
 * reveals nothing about tenants that are not publicly active.
 */
@Controller('public/tenants')
export class PublicTenantController {
  constructor(private readonly tenancy: TenancyService) {}

  @Get(':slug')
  async get(@Param('slug') slug: string): Promise<PublicTenant> {
    const tenant = await this.tenancy.resolveActiveTenant(slug);
    if (tenant === undefined) throw new NotFoundException();
    return { slug: tenant.slug, displayName: tenant.displayName };
  }
}
