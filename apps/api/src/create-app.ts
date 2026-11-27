import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import type { INestApplication, LoggerService, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { AppModule } from './app.module.js';
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
};

export async function createApp(options: CreateAppOptions = {}): Promise<INestApplication> {
  // Configure logging before bootstrap so module-initialisation logs honour it too.
  const logger = options.logger ?? new JsonLogger({ level: 'info' });
  Logger.overrideLogger(logger);
  const app = await NestFactory.create<NestExpressApplication>(options.rootModule ?? AppModule);
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
