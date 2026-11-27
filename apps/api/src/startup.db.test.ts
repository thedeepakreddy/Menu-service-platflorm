// The built API refuses to start with a database role that could bypass row-level security
// (D-028), and starts with the restricted runtime role. Runs `dist/main.js` (turbo builds the
// API before `test:db`).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, inject, it } from 'vitest';

const apiRoot = fileURLToPath(new URL('../', import.meta.url));
const { ownerUrl, runtimeUrl } = inject('database');

/** Starts the built API; resolves with its exit code, or 'listening' once /health answers. */
function startApi(databaseUrl: string): Promise<number | 'listening'> {
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

describe('API startup database role check (D-028)', () => {
  it('refuses to start as the migration role, which owns the tables', async () => {
    expect(await startApi(ownerUrl)).toBe(1);
    expect(lastStderr).toContain('refusing to start');
    expect(lastStderr).toContain('owns application tables');
    expect(lastStderr).not.toContain('synthetic-owner-password');
  });

  it('starts with the restricted runtime role', async () => {
    expect(await startApi(runtimeUrl)).toBe('listening');
  });
});
