import { authHandlers, notConfigured } from '../../../auth/runtime';

export const dynamic = 'force-dynamic';

/** Whether a session exists and of which kind. Never returns tokens. */
export async function GET(request: Request) {
  const handlers = authHandlers();
  if (handlers === null) return notConfigured();
  return handlers.session(request);
}
