// Guards the test toolchain: NestJS constructor injection relies on
// emitDecoratorMetadata, which the Vitest transform must honour.
import 'reflect-metadata';

import { Injectable, Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { expect, it } from 'vitest';

@Injectable()
class Dependency {
  readonly value = 42;
}

@Injectable()
class Consumer {
  constructor(readonly dependency: Dependency) {}
}

@Module({ providers: [Dependency, Consumer] })
class ProbeModule {}

it('resolves constructor injection by type under Vitest', async () => {
  Logger.overrideLogger(false);
  const context = await NestFactory.createApplicationContext(ProbeModule);
  expect(context.get(Consumer).dependency.value).toBe(42);
  await context.close();
});
