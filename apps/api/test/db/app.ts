// Test API instances wired to the real test database and local test issuers (D-034).
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';

import { createApp } from '../../src/create-app.js';
import { createDatabase } from '../../src/infrastructure/database/database.js';
import type { Db } from '../../src/infrastructure/database/database.js';
import type { RateLimitConfig } from '../../src/infrastructure/rate-limit/rate-limit.js';
import type { IdentityConfig } from '../../src/modules/identity/index.js';
import { createTestIssuer } from '../identity/test-issuer.js';
import type { TestIssuer } from '../identity/test-issuer.js';
import { TEST_BFF_CREDENTIAL } from './fixtures.js';

export const OWNER_ISSUER = 'https://owners.idp.test';
export const OPERATOR_ISSUER = 'https://operators.idp.test';
export const OWNER_CLIENT = 'owner-web';
export const OPERATOR_CLIENT = 'operator-web';
export const OWNER_API = 'owner-project';
export const OPERATOR_API = 'operator-project';

export type TestIdps = { owner: TestIssuer; operator: TestIssuer };

export async function createIdps(): Promise<TestIdps> {
  return {
    owner: await createTestIssuer(OWNER_ISSUER, OWNER_API),
    operator: await createTestIssuer(OPERATOR_ISSUER, OPERATOR_API),
  };
}

export function identityConfig(idps: TestIdps): IdentityConfig {
  return {
    bffCredential: TEST_BFF_CREDENTIAL,
    owner: {
      issuer: OWNER_ISSUER,
      apiAudience: OWNER_API,
      clientId: OWNER_CLIENT,
      keys: idps.owner.keys,
      idleSeconds: 1800,
    },
    operator: {
      issuer: OPERATOR_ISSUER,
      apiAudience: OPERATOR_API,
      clientId: OPERATOR_CLIENT,
      keys: idps.operator.keys,
      mfaMaxAgeSeconds: 3600,
      idleSeconds: 900,
    },
  };
}

export type TestApp = { url: string; app: INestApplication; close(): Promise<void> };

export async function startTestApp(options: {
  runtimeUrl: string;
  operatorUrl?: string;
  identity: IdentityConfig;
  rateLimits?: RateLimitConfig;
  trustedProxies?: string[];
}): Promise<TestApp> {
  const db: Db = createDatabase({ connectionString: options.runtimeUrl, maxConnections: 5 });
  const operatorDb =
    options.operatorUrl === undefined
      ? undefined
      : createDatabase({ connectionString: options.operatorUrl, maxConnections: 2 });
  const app = await createApp({
    logger: false,
    database: db,
    operatorDatabase: operatorDb,
    identity: options.identity,
    rateLimits: options.rateLimits ?? NO_LIMITS,
    ...(options.trustedProxies === undefined ? {} : { trustedProxies: options.trustedProxies }),
  });
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer() as Server;
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    app,
    async close() {
      await app.close();
    },
  };
}

/** Generous limits so functional tests are never rate limited. */
export const NO_LIMITS: RateLimitConfig = {
  policies: {
    'public-tenant': { limit: 100_000, windowMs: 60_000 },
    owner: { limit: 100_000, windowMs: 60_000 },
    operator: { limit: 100_000, windowMs: 60_000 },
    session: { limit: 100_000, windowMs: 60_000 },
  },
  maxKeys: 50_000,
};
