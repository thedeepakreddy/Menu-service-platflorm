import { Global, Inject, Module } from '@nestjs/common';
import type { DynamicModule, OnApplicationShutdown } from '@nestjs/common';

import type { Db } from './database.js';

/** Injection token for the application's Kysely instance (runtime role only, D-028). */
export const DATABASE = Symbol('DATABASE');

/** Closes the pool when the application shuts down (`enableShutdownHooks`). */
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(db: Db): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [{ provide: DATABASE, useValue: db }, DatabaseLifecycle],
      exports: [DATABASE],
    };
  }
}
