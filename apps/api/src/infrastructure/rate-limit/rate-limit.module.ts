import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { RATE_LIMIT_CONFIG, RateLimitGuard } from './rate-limit.js';
import type { RateLimitConfig } from './rate-limit.js';

/** One limiter per application instance (D-031: instance-local). */
@Global()
@Module({})
export class RateLimitModule {
  static forRoot(config: RateLimitConfig): DynamicModule {
    return {
      module: RateLimitModule,
      providers: [{ provide: RATE_LIMIT_CONFIG, useValue: config }, RateLimitGuard],
      exports: [RATE_LIMIT_CONFIG, RateLimitGuard],
    };
  }
}
