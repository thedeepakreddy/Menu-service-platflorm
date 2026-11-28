import { isLocale } from './messages';
import { LOCALE_COOKIE } from './resolve';

/**
 * Locale switch (Phase 3; D-040 O-2, O-10; P3-07, P3-08). A plain HTML form POST, so it works
 * without JavaScript. It lives under the reserved `/platform` segment, so it can never shadow a
 * tenant slug.
 *
 * Security:
 *   - CSRF: POST only, and only with an `Origin` equal to the configured public origin.
 *     No configured origin: the switch is refused (fail closed) and the form is not rendered.
 *   - Open redirect: the return target is reduced to a same-origin path; anything else is `/`.
 *   - Input: a small URL-encoded body; the locale must be a supported locale.
 *   - Privacy: a session cookie (no Max-Age), host-only, Secure, HttpOnly, SameSite=Lax, holding
 *     only the locale code. It identifies nobody and is the only customer-side state (P3-08).
 */
export const LOCALE_SWITCH_PATH = '/platform/locale';
const MAX_BODY_BYTES = 1024;
const MAX_PATH_LENGTH = 512;
const PROBE_ORIGIN = 'http://return-path.invalid';

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** A same-origin path to return to, or `/`. Query strings and fragments are dropped. */
export function safeReturnPath(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_PATH_LENGTH) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  // Backslashes and control characters are normalized differently by browsers: refuse them all.
  if (raw.includes('\\') || hasControlCharacter(raw)) return '/';
  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return '/';
  }
  if (url.origin !== PROBE_ORIGIN) return '/';
  // Dot segments can normalize to a protocol-relative path ('/.//evil.example' → '//evil.example'),
  // which would leave the site if ever used as a relative Location (M3.6 review finding 4).
  return url.pathname.startsWith('//') ? '/' : url.pathname;
}

/** Session cookie holding the chosen locale. */
export function localeCookie(locale: string): string {
  return `${LOCALE_COOKIE}=${locale}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function plain(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function createLocaleSwitchHandler(config: { publicOrigin: string | undefined }) {
  return async function switchLocale(request: Request): Promise<Response> {
    if (request.method !== 'POST') return plain(405, 'Method not allowed');
    if (config.publicOrigin === undefined) return plain(403, 'Forbidden');
    if (request.headers.get('origin') !== config.publicOrigin) return plain(403, 'Forbidden');
    const type = request.headers.get('content-type') ?? '';
    if (!type.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
      return plain(415, 'Unsupported media type');
    }
    // Browsers always send Content-Length for a form POST. Requiring it means an over-long body is
    // refused before it is read (M3.6 review finding 5).
    const lengthHeader = request.headers.get('content-length');
    if (lengthHeader === null || !/^\d{1,6}$/.test(lengthHeader)) {
      return plain(411, 'Length required');
    }
    if (Number(lengthHeader) > MAX_BODY_BYTES) return plain(413, 'Too large');
    const body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) return plain(413, 'Too large');
    const form = new URLSearchParams(body);
    const locale = form.get('locale');
    if (!isLocale(locale)) return plain(400, 'Bad request');
    return new Response(null, {
      status: 303,
      headers: {
        location: `${config.publicOrigin}${safeReturnPath(form.get('return'))}`,
        'set-cookie': localeCookie(locale),
        'cache-control': 'no-store',
      },
    });
  };
}
