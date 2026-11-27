import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import type { INestApplication, LoggerService, LogLevel, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { AppModule } from './app.module.js';
import { requestIdMiddleware } from './request-id.js';

export type CreateAppOptions = {
  /** Root module; overridable so tests can mount extra controllers. */
  rootModule?: Type;
  logger?: LoggerService | LogLevel[] | false;
};

export async function createApp(options: CreateAppOptions = {}): Promise<INestApplication> {
  // Configure logging before bootstrap so module-initialisation logs honour it too.
  Logger.overrideLogger(options.logger ?? ['log', 'warn', 'error']);
  const app = await NestFactory.create<NestExpressApplication>(options.rootModule ?? AppModule);
  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  return app;
}
