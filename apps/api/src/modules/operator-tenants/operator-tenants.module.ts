import { Module } from '@nestjs/common';

import { OperatorTenantsController } from './operator-tenants.controller.js';
import { OperatorTenantsService } from './operator-tenants.service.js';

/** Operator tenant provisioning and lifecycle (Phase 2 M2.4). Needs Database and Identity modules. */
@Module({ controllers: [OperatorTenantsController], providers: [OperatorTenantsService] })
export class OperatorTenantsModule {}
