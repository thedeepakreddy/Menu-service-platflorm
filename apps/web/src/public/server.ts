import { headers } from 'next/headers';
import { cache } from 'react';

import { parseWebEnv } from '../env';
import { webClientAddress } from '../http/client-address';
import { RAW_TENANT_SEGMENT_HEADER } from './raw-segment';
import { createTenantResolver } from './tenant-resolver';
import type { TenantResolution } from './tenant-resolver';

const env = parseWebEnv(process.env);
const resolveTenant = createTenantResolver({
  apiOrigin: env.WEB_API_ORIGIN,
  bffCredential: env.WEB_API_BFF_CREDENTIAL,
});

/**
 * The public tenant for the current request (Phase 3). Memoized for the duration of ONE request
 * only (React `cache`), so the layout and the page share a single API call; nothing is cached
 * across requests or tenants (D-040 O-6).
 */
export const getPublicTenant = cache(async (slug: string): Promise<TenantResolution> => {
  const h = await headers();
  return resolveTenant({
    slug,
    rawSegment: h.get(RAW_TENANT_SEGMENT_HEADER) ?? undefined,
    clientAddress: webClientAddress(h.get('x-forwarded-for'), env.WEB_TRUSTED_PROXY_HOPS ?? 0),
  });
});
