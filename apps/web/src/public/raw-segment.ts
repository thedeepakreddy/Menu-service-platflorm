/**
 * The first path segment exactly as the client sent it (still percent-encoded), set by
 * `src/proxy.ts` on every request. Next.js decodes route parameters, so without this the page
 * could not tell `/cafe-roma` from `/cafe%2Droma`; D-040 O-1 requires the latter to be a 404.
 * The proxy always overwrites the header, so a client cannot supply its own value.
 */
export const RAW_TENANT_SEGMENT_HEADER = 'x-platform-raw-segment';

/** The raw first segment of a URL path (`/a%2Db/menu` → `a%2Db`), or undefined. */
export function rawFirstSegment(rawPath: string): string | undefined {
  const match = /^\/([^/?#]*)/.exec(rawPath);
  const segment = match?.[1];
  return segment === undefined || segment === '' ? undefined : segment;
}
