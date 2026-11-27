import { Module } from '@nestjs/common';

import { OwnerTenantController } from './owner-tenant.controller.js';
import { PublicTenantController } from './public-tenant.controller.js';
import { TenancyService } from './tenancy.service.js';

/** Tenant resolution and context (Phase 2, D-027). Requires the global DatabaseModule and IdentityModule. */
@Module({
  controllers: [PublicTenantController, OwnerTenantController],
  providers: [TenancyService],
  exports: [TenancyService],
})
export class TenancyModule {}
