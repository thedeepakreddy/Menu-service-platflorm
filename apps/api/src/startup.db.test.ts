// The built API refuses to start with a database role that could bypass row-level security
// (D-028), and starts with the restricted runtime role. Runs `dist/main.js` (turbo builds the
// API before `test:db`).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, inject, it } from 'vitest';

const apiRoot = fileURLToPath(new URL('../', import.meta.url));
const { ownerUrl, runtimeUrl, operatorUrl } = inject('database');

/** Starts the built API; resolves with its exit code, or 'listening' once /health answers. */
function startApi(
  databaseUrl: string,
  operatorDatabaseUrl?: string,
): Promise<number | 'listening'> {
  return new Promise((resolve) => {
    const port = String(20_000 + Math.floor(Math.random() * 20_000));
    const child = spawn(process.execPath, ['dist/main.js'], {
      cwd: apiRoot,
      env: {
        PATH: process.env.PATH ?? '',
        APP_ENV: 'test',
        API_HOST: '127.0.0.1',
        API_PORT: port,
        API_DATABASE_URL: databaseUrl,
        ...(operatorDatabaseUrl === undefined
          ? {}
          : { API_OPERATOR_DATABASE_URL: operatorDatabaseUrl }),
        API_LOG_LEVEL: 'error',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    const timer = setInterval(() => {
      fetch(`http://127.0.0.1:${port}/health`)
        .then((res) => {
          if (res.ok) {
            clearInterval(timer);
            child.kill('SIGTERM');
            resolve('listening');
          }
        })
        .catch(() => undefined);
    }, 200);
    child.on('exit', (code) => {
      clearInterval(timer);
      lastStderr = stderr;
      resolve(code ?? -1);
    });
  });
}
let lastStderr = '';

describe('API startup database role check (D-028, D-035)', () => {
  it('refuses to start as the migration role, which owns the tables', async () => {
    expect(await startApi(ownerUrl)).toBe(1);
    expect(lastStderr).toContain('refusing to start');
    expect(lastStderr).toContain('owns database objects');
    expect(lastStderr).not.toContain('synthetic-owner-password');
  });

  it('starts with the restricted runtime role', async () => {
    expect(await startApi(runtimeUrl)).toBe('listening');
  });

  it('refuses to start when the operator connection uses the table-owning role (M2.4)', async () => {
    expect(await startApi(runtimeUrl, ownerUrl)).toBe(1);
    expect(lastStderr).toContain('owns database objects');
  });

  it('refuses the two pool credentials swapped (effective privileges, not names)', async () => {
    expect(await startApi(operatorUrl, runtimeUrl)).toBe(1);
    expect(lastStderr).toContain('unexpected privileges');
  });

  it('refuses a runtime URL that presets a tenant context (audit A-07)', async () => {
    const url = new URL(runtimeUrl);
    url.searchParams.set('options', '-c app.tenant_id=0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a');
    expect(await startApi(url.toString())).toBe(1);
    expect(lastStderr).toContain('preset tenant context');
  });

  it('starts with the runtime and operator roles', async () => {
    expect(await startApi(runtimeUrl, operatorUrl)).toBe('listening');
  });
});
