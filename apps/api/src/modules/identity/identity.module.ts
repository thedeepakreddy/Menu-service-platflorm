import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { BffGuard, IDENTITY, OperatorGuard, OwnerGuard } from './guards.js';
import type { IdentityConfig } from './guards.js';
import { OperatorSessionController } from './operator-session.controller.js';
import { SessionService } from './session.service.js';
import { SessionsController } from './sessions.controller.js';

/** Login verification and server-side sessions (Phase 2, D-034). Requires the DatabaseModule. */
@Global()
@Module({})
export class IdentityModule {
  static forRoot(config: IdentityConfig): DynamicModule {
    return {
      module: IdentityModule,
      controllers: [SessionsController, OperatorSessionController],
      providers: [
        { provide: IDENTITY, useValue: config },
        SessionService,
        BffGuard,
        OwnerGuard,
        OperatorGuard,
      ],
      exports: [IDENTITY, SessionService, BffGuard, OwnerGuard, OperatorGuard],
    };
  }
}
