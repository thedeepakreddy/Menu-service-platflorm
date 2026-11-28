import { publicTenantSchema, tenantSlugSchema } from '@platform/contracts';
import type { PublicTenant } from '@platform/contracts';

/**
 * Public tenant resolution for the customer platform (Phase 3; Doc 03 §3, D-027, D-040 O-1, O-5).
 *
 * The route segment is UNTRUSTED input. Only an exact canonical slug is ever looked up:
 *   - the raw, still-encoded path segment must equal the decoded value (no `%xx` spellings);
 *   - it must pass the shared slug contract (lower case, length, reserved words).
 * Anything else is "not found" without contacting the API, and is never redirected or normalized
 * into a valid tenant (O-1). The API is the only source of truth: it returns active tenants only,
 * and unknown, suspended and retired tenants are the same 404, so lifecycle never leaks (D-027).
 *
 * Content delivery seam (O-5): the response is parsed with `publicTenantSchema`, so only the
 * provisioned public identity (slug, display name) can ever reach a page. There is no cache:
 * every request asks the API (O-6), so a suspension is visible on the next request.
 */
export type TenantResolution = { kind: 'found'; tenant: PublicTenant } | { kind: 'not-found' };

/** The API could not answer (outage, timeout, rate limit, bad reply): show the error state. */
export class PublicApiUnavailableError extends Error {
  override name = 'PublicApiUnavailableError';
}

export type ResolverConfig = {
  /** Server-to-server API origin (WEB_API_ORIGIN). Undefined: public pages cannot be served. */
  apiOrigin: string | undefined;
  /**
   * The BFF credential. When present, the browser's address is forwarded so the API's per-client
   * rate limits apply per visitor instead of to the web server as a whole (D-037).
   */
  bffCredential: string | undefined;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export type ResolveInput = {
  /** Decoded route parameter. */
  slug: string;
  /** The same segment as it appeared in the request URL, still percent-encoded. */
  rawSegment: string | undefined;
  /** Client address as attributed by the trusted-proxy rule, or 'unknown'. */
  clientAddress: string;
};

export function isCanonicalSlug(slug: string, rawSegment: string | undefined): boolean {
  if (rawSegment === undefined || rawSegment !== slug) return false;
  return tenantSlugSchema.safeParse(slug).success;
}

export function createTenantResolver(config: ResolverConfig) {
  const doFetch = config.fetch ?? fetch;
  return async function resolveTenant(input: ResolveInput): Promise<TenantResolution> {
    if (!isCanonicalSlug(input.slug, input.rawSegment)) return { kind: 'not-found' };
    if (config.apiOrigin === undefined) {
      throw new PublicApiUnavailableError('WEB_API_ORIGIN is not configured');
    }
    const headers: Record<string, string> = { accept: 'application/json' };
    if (config.bffCredential !== undefined && input.clientAddress !== 'unknown') {
      headers['x-platform-bff-credential'] = config.bffCredential;
      headers['x-platform-client-address'] = input.clientAddress;
    }
    let res: Response;
    try {
      res = await doFetch(`${config.apiOrigin}/public/tenants/${input.slug}`, {
        headers,
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(config.timeoutMs ?? 5_000),
      });
    } catch {
      throw new PublicApiUnavailableError('API unreachable');
    }
    if (res.status === 404) return { kind: 'not-found' };
    if (res.status !== 200)
      throw new PublicApiUnavailableError(`API answered ${String(res.status)}`);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new PublicApiUnavailableError('API reply was not JSON');
    }
    const parsed = publicTenantSchema.safeParse(body);
    // The API must answer for the slug that was asked; anything else is an integrity failure.
    if (!parsed.success || parsed.data.slug !== input.slug) {
      throw new PublicApiUnavailableError('API reply did not match the contract');
    }
    return { kind: 'found', tenant: parsed.data };
  };
}
