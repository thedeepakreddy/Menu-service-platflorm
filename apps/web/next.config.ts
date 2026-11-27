import type { NextConfig } from 'next';

import { parseWebEnv } from './src/env';
import { webSecurityHeaders } from './src/security-headers';

// Fail fast on invalid configuration (P-107).
const env = parseWebEnv(process.env);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Security baseline headers on every route (D-019).
  headers: () => Promise.resolve([{ source: '/:path*', headers: webSecurityHeaders(env.APP_ENV) }]),
};

export default nextConfig;
