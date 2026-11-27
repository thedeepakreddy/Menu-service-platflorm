import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { IDENTITY, OperatorGuard, OwnerGuard } from './guards.js';
import type { IdentityConfig } from './guards.js';
import { AccountService } from './identity.service.js';
import { OperatorSessionController } from './operator-session.controller.js';

/** Identity verification and account mapping (Phase 2, D-025). Requires the DatabaseModule. */
@Global()
@Module({})
export class IdentityModule {
  static forRoot(config: IdentityConfig): DynamicModule {
    return {
      module: IdentityModule,
      controllers: [OperatorSessionController],
      providers: [
        { provide: IDENTITY, useValue: config },
        AccountService,
        OwnerGuard,
        OperatorGuard,
      ],
      exports: [IDENTITY, AccountService, OwnerGuard, OperatorGuard],
    };
  }
}
