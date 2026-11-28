// Shared by the login handlers (D-038) and the public tenant pages (Phase 3): one rule for whose
// address a request is attributed to. Lives outside `auth/` so public pages never import auth code.

const ADDRESS = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * The client address the web app attributes a request to. Next.js fills X-Forwarded-For with the
 * socket address only when the header is ABSENT, so a directly exposed server cannot trust it at
 * all. With `trustedHops` proxies in front (each appending one entry), the client is the entry
 * that many places from the right. Returns 'unknown' when it cannot be determined: the request
 * then shares one per-client budget (and the global limits still apply).
 *
 * Only the right-most `trustedHops` entries are ever read: they were appended by our own proxies,
 * so a client that prepends any number of entries cannot push itself into the shared 'unknown'
 * bucket (Phase 3 M3.6 review). Header size itself is bounded by the HTTP server.
 */
export function webClientAddress(forwardedFor: string | null, trustedHops: number): string {
  if (trustedHops === 0 || forwardedFor === null) return 'unknown';
  const hops = forwardedFor.split(',');
  const candidate = hops[hops.length - trustedHops]?.trim();
  return candidate !== undefined && ADDRESS.test(candidate) ? candidate : 'unknown';
}
