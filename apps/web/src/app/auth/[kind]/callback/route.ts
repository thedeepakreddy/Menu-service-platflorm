import { authHandlers, notConfigured } from '../../../../auth/runtime';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const handlers = authHandlers();
  if (handlers === null) return notConfigured();
  const { kind } = await context.params;
  return handlers.callback(request, kind);
}
