// Audit F-04: HSTS on the web app follows the RUNTIME APP_ENV, not the one the
// app was built with, so one immutable artifact can be promoted from test to
// staging to production (Doc 01 §17, D-019). Runs against the real build
// output, which CI builds with APP_ENV=test.
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

let server: ChildProcess | undefined;

afterEach(() => {
  // Next.js runs its server in a child process; kill the whole process group.
  if (server?.pid !== undefined) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      // already exited
    }
  }
  server = undefined;
});

/** Starts the built web app with the given APP_ENV and resolves its base URL. */
function startWeb(appEnv: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'start', '-p', '0', '-H', '127.0.0.1'],
      {
        cwd: `${repoRoot}apps/web`,
        env: { PATH: process.env.PATH ?? '', APP_ENV: appEnv },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    server = child;
    let output = '';
    const timer = setTimeout(() => {
      reject(new Error(`next start did not become ready:\n${output}`));
    }, 30_000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = /https?:\/\/[^\s]+:(\d+)/.exec(output);
      if (match?.[1] !== undefined) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`next start exited with ${String(code)}:\n${output}`));
    });
  });
}

describe('web HSTS is decided at runtime (audit F-04)', () => {
  it.each([
    ['production', true],
    ['staging', true],
    ['test', false],
    ['development', false],
  ] as const)('APP_ENV=%s at runtime → HSTS %s', async (appEnv, expected) => {
    const base = await startWeb(appEnv);
    for (const path of ['/', '/does-not-exist']) {
      const res = await fetch(`${base}${path}`);
      expect(res.headers.get('strict-transport-security') !== null).toBe(expected);
      // The environment-independent baseline is present either way.
      expect(res.headers.get('x-frame-options')).toBe('DENY');
    }
  });
});
