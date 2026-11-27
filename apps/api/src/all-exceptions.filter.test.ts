// Unit tests for the exception filter's guards (audit L-05) and its
// logging split (D-020), using a stubbed ArgumentsHost.
import type { ArgumentsHost } from '@nestjs/common';
import { Logger, NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { JsonLogger } from './logging/json-logger.js';

type FakeResponse = {
  headersSent: boolean;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

function httpHost(res: FakeResponse, requestId = 'req-filter-0001'): ArgumentsHost {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ requestId }),
      getResponse: () => res,
      getNext: () => undefined,
    }),
  } as unknown as ArgumentsHost;
}

function fakeResponse(headersSent = false): FakeResponse {
  const res: FakeResponse = { headersSent, status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

/** Routes Nest's Logger to a capture sink; returns a reader for the parsed entries. */
function captureLogs(): () => Record<string, unknown>[] {
  const lines: string[] = [];
  Logger.overrideLogger(new JsonLogger({ level: 'debug', sink: (line) => lines.push(line) }));
  return () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

afterEach(() => {
  Logger.overrideLogger(false);
});

describe('AllExceptionsFilter', () => {
  it('writes the error envelope for HTTP errors and logs 4xx at info with code only', () => {
    const logs = captureLogs();
    const res = fakeResponse();
    new AllExceptionsFilter().catch(new NotFoundException('secret detail'), httpHost(res));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
        requestId: 'req-filter-0001',
      },
    });
    expect(logs()[0]).toMatchObject({ level: 'info', event: 'http_error', status: 404 });
    expect(JSON.stringify(logs())).not.toContain('secret detail');
  });

  it('does not write to a response whose headers were already sent (L-05)', () => {
    const logs = captureLogs();
    const res = fakeResponse(true);
    new AllExceptionsFilter().catch(new Error('late failure'), httpHost(res));
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(logs().map((entry) => entry.event)).toEqual(['exception', 'response_already_sent']);
  });

  it('does not treat a non-HTTP context as HTTP (L-05)', () => {
    const logs = captureLogs();
    const switchToHttp = vi.fn();
    const host = { getType: () => 'rpc', switchToHttp } as unknown as ArgumentsHost;
    new AllExceptionsFilter().catch(new Error('queue failure'), host);
    expect(switchToHttp).not.toHaveBeenCalled();
    expect(logs()[0]).toMatchObject({ level: 'error', event: 'exception', transport: 'rpc' });
  });
});
