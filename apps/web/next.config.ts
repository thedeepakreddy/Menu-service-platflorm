import type { NextConfig } from 'next';

import { parseWebEnv } from './src/env';
import { webSecurityHeaders } from './src/security-headers';

// Fail fast on invalid configuration (P-107).
parseWebEnv(process.env);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Environment-independent security headers on every route (D-019). HSTS depends
  // on the runtime APP_ENV and is set per request by src/proxy.ts (audit F-04).
  headers: () => Promise.resolve([{ source: '/:path*', headers: webSecurityHeaders() }]),
};

export default nextConfig;
