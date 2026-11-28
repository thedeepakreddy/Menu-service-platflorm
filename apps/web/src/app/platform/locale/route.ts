import { parseWebEnv } from '../../../env';
import { createLocaleSwitchHandler } from '../../../i18n/switch';

/** Locale switch endpoint (Phase 3; see `i18n/switch.ts`). POST only; other methods get 405. */
export const dynamic = 'force-dynamic';

const handler = createLocaleSwitchHandler({
  publicOrigin: parseWebEnv(process.env).WEB_PUBLIC_ORIGIN,
});

export function POST(request: Request): Promise<Response> {
  return handler(request);
}
