import {
  Controller,
  Get,
  Global,
  Inject,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { DynamicModule, OnApplicationShutdown } from '@nestjs/common';

import { isDatabaseReady } from './database.js';
import type { Db } from './database.js';

/** Injection token for the application's Kysely instance (runtime role only, D-028). */
export const DATABASE = Symbol('DATABASE');

/**
 * Injection token for the operator-role connection (D-028): the only path to the operator
 * SECURITY DEFINER functions. `null` when not configured; operator actions then fail closed.
 */
export const OPERATOR_DATABASE = Symbol('OPERATOR_DATABASE');

/** Closes the pool when the application shuts down (`enableShutdownHooks`). */
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    @Inject(OPERATOR_DATABASE) private readonly operatorDb: Db | null,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.db.destroy(), this.operatorDb?.destroy()]);
  }
}

/**
 * `GET /health/ready`: readiness (audit B-01, G-33). Liveness (`GET /health`) never touches a
 * dependency; readiness answers 503 while the database is unreachable, so a load balancer stops
 * routing to this instance until the pool has reconnected.
 */
@Controller('health')
class ReadinessController {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  @Get('ready')
  async ready(): Promise<{ status: 'ready' }> {
    if (!(await isDatabaseReady(this.db))) throw new ServiceUnavailableException();
    return { status: 'ready' };
  }
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(db: Db, operatorDb?: Db): DynamicModule {
    return {
      module: DatabaseModule,
      controllers: [ReadinessController],
      providers: [
        { provide: DATABASE, useValue: db },
        { provide: OPERATOR_DATABASE, useValue: operatorDb ?? null },
        DatabaseLifecycle,
      ],
      exports: [DATABASE, OPERATOR_DATABASE],
    };
  }
}
