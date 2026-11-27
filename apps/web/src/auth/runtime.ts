import { parseWebEnv } from '../env';
import { authConfigFromEnv } from './config';
import { createAuthHandlers } from './handlers';
import type { AuthHandlers } from './handlers';

let handlers: AuthHandlers | null | undefined;

/** Login handlers for this server process, or null when no login domain is configured. */
export function authHandlers(): AuthHandlers | null {
  if (handlers === undefined) {
    const config = authConfigFromEnv(parseWebEnv(process.env));
    handlers = config === undefined ? null : createAuthHandlers(config);
  }
  return handlers;
}

/** Fail closed when login is not configured. */
export function notConfigured(): Response {
  return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
}
