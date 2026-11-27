// Integration tests for the Phase 1 security and logging baseline (G-36,
// G-38; decisions D-019, D-020) against a real HTTP server.
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { Controller, Get, Module, Post } from '@nestjs/common';
import { REQUEST_ID_HEADER, errorEnvelopeSchema } from '@platform/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { AppModule } from './app.module.js';
import { createApp } from './create-app.js';
import type { CreateAppOptions } from './create-app.js';
import { JsonLogger } from './logging/json-logger.js';
import { MAX_LOGGED_PATH_LENGTH } from './logging/request-logging.js';

const SECRET = 'sk_test_DO_NOT_LOG_42';

@Controller('__test__')
class ProbeController {
  @Get('boom')
  boom(): never {
    throw new Error(`database password=${SECRET} at postgres://app:${SECRET}@db/x`);
  }

  @Post('echo')
  echo(): { ok: true } {
    return { ok: true };
  }
}

@Module({ imports: [AppModule], controllers: [ProbeController] })
class TestRootModule {}

let app: INestApplication | undefined;

async function start(options: Omit<CreateAppOptions, 'rootModule' | 'logger'> = {}) {
  const lines: string[] = [];
  app = await createApp({
    ...options,
    rootModule: TestRootModule,
    logger: new JsonLogger({ level: 'debug', sink: (line) => lines.push(line) }),
  });
  await app.listen(0, '127.0.0.1');
  const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
  const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { base: `http://127.0.0.1:${String(port)}`, lines, entries };
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('security headers (D-019)', () => {
  it('sets the baseline headers on success and error responses', async () => {
    const { base } = await start();
    for (const path of ['/health', '/does-not-exist']) {
      const res = await fetch(`${base}${path}`);
      expect(res.headers.get('content-security-policy')).toBe(
        "default-src 'none'; frame-ancestors 'none'",
      );
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
      expect(res.headers.get('cross-origin-resource-policy')).toBe('same-site');
      expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin');
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('x-powered-by')).toBeNull();
      expect(res.headers.get('strict-transport-security')).toBeNull();
    }
  });

  it('sends HSTS only when enabled', async () => {
    const { base } = await start({ hsts: true });
    const res = await fetch(`${base}/health`);
    expect(res.headers.get('strict-transport-security')).toBe('max-age=31536000');
  });
});

describe('CORS (D-019)', () => {
  const preflight = (base: string, origin: string) =>
    fetch(`${base}/health`, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
    });

  it('allows no cross-origin access by default', async () => {
    const { base } = await start();
    const pre = await preflight(base, 'https://any.example');
    expect(pre.headers.get('access-control-allow-origin')).toBeNull();
    const res = await fetch(`${base}/health`, { headers: { Origin: 'https://any.example' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('allows exactly the configured origins, without credentials', async () => {
    const { base } = await start({ corsAllowedOrigins: ['https://allowed.example'] });
    const pre = await preflight(base, 'https://allowed.example');
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://allowed.example');
    expect(pre.headers.get('access-control-allow-methods')).toBe('GET,HEAD');
    expect(pre.headers.get('access-control-allow-credentials')).toBeNull();
    expect(pre.headers.get('vary')).toMatch(/Origin/i);
    const res = await fetch(`${base}/health`, { headers: { Origin: 'https://allowed.example' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://allowed.example');
    expect(res.headers.get('access-control-expose-headers')).toMatch(/X-Request-Id/i);
  });

  it.each([
    'https://evil.example',
    'https://allowed.example.evil.example',
    'null',
    'http://allowed.example',
  ])('refuses other origins: %s', async (origin) => {
    const { base } = await start({ corsAllowedOrigins: ['https://allowed.example'] });
    const pre = await preflight(base, origin);
    expect(pre.headers.get('access-control-allow-origin')).toBeNull();
    const res = await fetch(`${base}/health`, { headers: { Origin: origin } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('structured, redacted logging (D-020)', () => {
  it('logs one safe entry per request and never logs headers, query or body', async () => {
    const { base, lines, entries } = await start();
    const res = await fetch(`${base}/__test__/echo?token=${SECRET}&email=a@b.example`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SECRET}`,
        Cookie: `session=${SECRET}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.9',
        [REQUEST_ID_HEADER]: 'req-log-test-1',
      },
      body: JSON.stringify({ password: SECRET, name: 'Customer Name' }),
    });
    expect(res.status).toBe(201);
    const request = entries().find((e) => e.event === 'request');
    expect(request).toMatchObject({
      level: 'info',
      context: 'HTTP',
      method: 'POST',
      path: '/__test__/echo',
      status: 201,
      requestId: 'req-log-test-1',
    });
    expect(typeof request?.durationMs).toBe('number');
    const all = lines.join('\n');
    for (const forbidden of [
      SECRET,
      'a@b.example',
      'Customer Name',
      '203.0.113.9',
      'Bearer',
      'session=',
    ]) {
      expect(all).not.toContain(forbidden);
    }
  });

  it('logs 5xx with request id and a redacted error, and returns only the generic envelope', async () => {
    const { base, lines, entries } = await start();
    const res = await fetch(`${base}/__test__/boom`, {
      headers: { [REQUEST_ID_HEADER]: 'req-boom-0001' },
    });
    expect(res.status).toBe(500);
    const body = errorEnvelopeSchema.parse(await res.json());
    expect(body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      requestId: 'req-boom-0001',
    });
    const exception = entries().find((e) => e.event === 'exception');
    expect(exception).toMatchObject({ level: 'error', requestId: 'req-boom-0001', status: 500 });
    expect(JSON.stringify(exception)).toContain('stack');
    expect(lines.join('\n')).not.toContain(SECRET);
  });

  // Audit F-01: a long, pathological request path is capped at the source.
  it('caps a long client-controlled path before logging it', async () => {
    const { base, entries } = await start();
    const longPath = `/${'a.'.repeat(7900)}`;
    const res = await fetch(`${base}${longPath}`);
    expect(res.status).toBe(404);
    const request = entries().find((e) => e.event === 'request');
    const logged = String(request?.path);
    expect(logged.length).toBeLessThanOrEqual(MAX_LOGGED_PATH_LENGTH + '…[truncated]'.length);
    expect(logged.endsWith('…[truncated]')).toBe(true);
  });

  it('logs 4xx at info with status and code only', async () => {
    const { entries } = await start().then(async (ctx) => {
      await fetch(`${ctx.base}/nope?q=${SECRET}`);
      return ctx;
    });
    const httpError = entries().find((e) => e.event === 'http_error');
    expect(httpError).toMatchObject({ level: 'info', status: 404, code: 'NOT_FOUND' });
    expect(Object.keys(httpError ?? {}).sort()).toEqual(
      ['code', 'context', 'event', 'level', 'requestId', 'status', 'time'].sort(),
    );
  });
});
