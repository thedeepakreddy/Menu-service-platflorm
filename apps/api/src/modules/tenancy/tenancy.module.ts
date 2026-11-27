import { Module } from '@nestjs/common';

import { PublicTenantController } from './public-tenant.controller.js';
import { TenancyService } from './tenancy.service.js';

/** Tenant resolution and context (Phase 2, D-027). Requires the global DatabaseModule. */
@Module({
  controllers: [PublicTenantController],
  providers: [TenancyService],
  exports: [TenancyService],
})
export class TenancyModule {}
