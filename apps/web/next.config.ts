import type { NextConfig } from 'next';

import { parseWebEnv } from './src/env';

// Fail fast on invalid configuration (P-107).
parseWebEnv(process.env);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
