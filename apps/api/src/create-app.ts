import 'reflect-metadata';

import { Logger, Module } from '@nestjs/common';
import type { INestApplication, LoggerService, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { AppModule } from './app.module.js';
import type { Db } from './infrastructure/database/database.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { IdentityModule } from './modules/identity/index.js';
import type { IdentityConfig } from './modules/identity/index.js';
import { OperatorTenantsModule } from './modules/operator-tenants/index.js';
import { TenancyModule } from './modules/tenancy/index.js';
import { JsonLogger } from './logging/json-logger.js';
import { requestLoggingMiddleware } from './logging/request-logging.js';
import { requestIdMiddleware } from './request-id.js';
import { corsOptions } from './security/cors.js';
import { securityHeaders } from './security/security-headers.js';

export type CreateAppOptions = {
  /** Root module; overridable so tests can mount extra controllers. */
  rootModule?: Type;
  /** Logger; defaults to the structured JSON logger at `info`. `false` silences logs (tests). */
  logger?: LoggerService | false;
  /** Exact origins allowed for CORS; empty or absent means no cross-origin access (D-019). */
  corsAllowedOrigins?: readonly string[];
  /** Send HSTS; only for production-like environments that terminate TLS (D-019). */
  hsts?: boolean;
  /** The runtime-role database (D-028). Absent in tests that need no database. */
  database?: Db;
  /** Owner and operator token verifiers (D-025). A missing one fails its routes closed. */
  identity?: IdentityConfig;
  /** The operator-role database (D-028). Absent: operator actions fail closed (503). */
  operatorDatabase?: Db;
};

export async function createApp(options: CreateAppOptions = {}): Promise<INestApplication> {
  // Configure logging before bootstrap so module-initialisation logs honour it too.
  const logger = options.logger ?? new JsonLogger({ level: 'info' });
  Logger.overrideLogger(logger);
  const root = options.rootModule ?? AppModule;
  // The database module is global, so domain modules can inject DATABASE.
  const entry =
    options.database === undefined
      ? root
      : rootWithDatabase(root, options.database, options.identity ?? {}, options.operatorDatabase);
  const app = await NestFactory.create<NestExpressApplication>(entry);
  if (logger !== false) app.useLogger(logger);
  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(requestLoggingMiddleware);
  app.use(securityHeaders({ hsts: options.hsts ?? false }));
  const cors = corsOptions(options.corsAllowedOrigins ?? []);
  if (cors !== undefined) app.enableCors(cors);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  return app;
}

/** Modules that need the database; mounted only when one is supplied. */
function rootWithDatabase(
  root: Type,
  db: Db,
  identity: IdentityConfig,
  operatorDb: Db | undefined,
): Type {
  @Module({
    imports: [
      DatabaseModule.forRoot(db, operatorDb),
      IdentityModule.forRoot(identity),
      root,
      TenancyModule,
      OperatorTenantsModule,
    ],
  })
  class RootWithDatabase {}
  return RootWithDatabase;
}
