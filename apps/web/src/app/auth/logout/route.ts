import { authHandlers, notConfigured } from '../../../auth/runtime';

export const dynamic = 'force-dynamic';

/** POST only (CSRF, D-033); other methods get 405 from Next.js. */
export async function POST(request: Request) {
  const handlers = authHandlers();
  if (handlers === null) return notConfigured();
  return handlers.logout(request);
}
