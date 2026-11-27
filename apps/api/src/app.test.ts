import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Controller, Get, Module } from '@nestjs/common';
import { REQUEST_ID_HEADER, errorEnvelopeSchema, healthResponseSchema } from '@platform/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './app.module.js';
import { createApp } from './create-app.js';

const INTERNAL_DETAIL = 'db password=hunter2 at /internal/path';

@Controller('__test__')
class FailingController {
  @Get('boom')
  boom(): never {
    throw new Error(INTERNAL_DETAIL);
  }
}

@Module({ imports: [AppModule], controllers: [FailingController] })
class TestRootModule {}

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  app = await createApp({ rootModule: TestRootModule, logger: false });
  await app.listen(0, '127.0.0.1');
  const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${String(port)}`;
});

afterAll(async () => {
  await app.close();
});

describe('API skeleton (real HTTP server)', () => {
  it('GET /health returns the contract payload and a request id', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(await res.json())).toEqual({ status: 'ok', service: 'api' });
    expect(res.headers.get(REQUEST_ID_HEADER)).toBeTruthy();
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('echoes a well-formed client request id', async () => {
    const res = await fetch(`${baseUrl}/health`, {
      headers: { [REQUEST_ID_HEADER]: 'client-req-0001' },
    });
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe('client-req-0001');
  });

  it('replaces a malformed client request id', async () => {
    const res = await fetch(`${baseUrl}/health`, {
      headers: { [REQUEST_ID_HEADER]: 'bad;id' },
    });
    const id = res.headers.get(REQUEST_ID_HEADER);
    expect(id).toBeTruthy();
    expect(id).not.toBe('bad;id');
  });

  it('unknown routes return a 404 error envelope', async () => {
    const res = await fetch(`${baseUrl}/does-not-exist`);
    expect(res.status).toBe(404);
    const body = errorEnvelopeSchema.parse(await res.json());
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(res.headers.get(REQUEST_ID_HEADER));
  });

  it('unexpected errors return 500 INTERNAL_ERROR without leaking details', async () => {
    const res = await fetch(`${baseUrl}/__test__/boom`);
    expect(res.status).toBe(500);
    const raw = await res.text();
    expect(raw).not.toContain('hunter2');
    expect(raw).not.toContain('/internal/path');
    const body = errorEnvelopeSchema.parse(JSON.parse(raw));
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('wrong method on an existing path is not served', async () => {
    const res = await fetch(`${baseUrl}/health`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(errorEnvelopeSchema.safeParse(await res.json()).success).toBe(true);
  });
});
