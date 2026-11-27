import { Global, Inject, Module } from '@nestjs/common';
import type { DynamicModule, OnApplicationShutdown } from '@nestjs/common';

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

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(db: Db, operatorDb?: Db): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        { provide: DATABASE, useValue: db },
        { provide: OPERATOR_DATABASE, useValue: operatorDb ?? null },
        DatabaseLifecycle,
      ],
      exports: [DATABASE, OPERATOR_DATABASE],
    };
  }
}
