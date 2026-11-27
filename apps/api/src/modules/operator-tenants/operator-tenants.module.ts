import { Module } from '@nestjs/common';

import { IDENTITY } from '../identity/index.js';
import type { IdentityConfig } from '../identity/index.js';
import {
  OperatorAccountsController,
  OperatorOperationsController,
  OperatorTenantsController,
} from './operator-tenants.controller.js';
import { OperatorTenantsService, OWNER_ISSUER } from './operator-tenants.service.js';

/**
 * Operator control plane: tenant provisioning and lifecycle, owner account lifecycle, operation
 * outcomes (Phase 2 M2.4 and audit remediation E-01, B-02). Needs the Database and Identity modules.
 */
@Module({
  controllers: [
    OperatorTenantsController,
    OperatorAccountsController,
    OperatorOperationsController,
  ],
  providers: [
    OperatorTenantsService,
    {
      provide: OWNER_ISSUER,
      useFactory: (identity: IdentityConfig) => identity.owner?.issuer ?? null,
      inject: [IDENTITY],
    },
  ],
})
export class OperatorTenantsModule {}
