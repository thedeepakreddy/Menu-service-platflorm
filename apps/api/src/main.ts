import { createRemoteJWKSet } from 'jose';

import { createApp } from './create-app.js';
import { parseApiEnv, PRODUCTION_LIKE } from './env.js';
import { assertSafeRuntimeRole, createDatabase } from './infrastructure/database/database.js';
import { JsonLogger } from './logging/json-logger.js';
import { redactString } from './logging/redact.js';
import type { IdentityConfig } from './modules/identity/index.js';

async function main(): Promise<void> {
  const parsed = parseApiEnv(process.env);
  if (!parsed.ok) {
    // No logger exists yet; write directly to stderr. Values are never printed.
    const lines = parsed.issues.map((issue) => `  - ${issue.variable} ${issue.problem}`);
    process.stderr.write(`Invalid API configuration; refusing to start:\n${lines.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  const { APP_ENV, API_HOST, API_PORT, API_CORS_ALLOWED_ORIGINS, API_LOG_LEVEL } = parsed.env;
  const logger = new JsonLogger({ level: API_LOG_LEVEL });

  // Fail closed before serving anything: the database role must not be able to bypass
  // row-level security (D-028). A superuser or a table owner would silently see every tenant.
  const db = createDatabase({
    connectionString: parsed.env.API_DATABASE_URL,
    maxConnections: parsed.env.API_DATABASE_POOL_MAX,
  });
  const operatorDb =
    parsed.env.API_OPERATOR_DATABASE_URL === undefined
      ? undefined
      : createDatabase({
          connectionString: parsed.env.API_OPERATOR_DATABASE_URL,
          maxConnections: 2,
        });
  try {
    await assertSafeRuntimeRole(db, 'runtime');
    if (operatorDb !== undefined) await assertSafeRuntimeRole(operatorDb, 'operator');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    process.stderr.write(`Database check failed; refusing to start: ${redactString(message)}\n`);
    await Promise.all([db.destroy(), operatorDb?.destroy()]);
    process.exitCode = 1;
    return;
  }

  const env = parsed.env;
  const identity: IdentityConfig = { bffCredential: env.API_BFF_CREDENTIAL };
  if (
    env.API_OWNER_OIDC_ISSUER &&
    env.API_OWNER_OIDC_AUDIENCE &&
    env.API_OWNER_OIDC_JWKS_URL &&
    env.API_OWNER_OIDC_CLIENT_ID
  ) {
    identity.owner = {
      issuer: env.API_OWNER_OIDC_ISSUER,
      apiAudience: env.API_OWNER_OIDC_AUDIENCE,
      clientId: env.API_OWNER_OIDC_CLIENT_ID,
      keys: createRemoteJWKSet(new URL(env.API_OWNER_OIDC_JWKS_URL)),
      idleSeconds: env.API_OWNER_SESSION_IDLE_SECONDS,
    };
  }
  if (
    env.API_OPERATOR_OIDC_ISSUER &&
    env.API_OPERATOR_OIDC_AUDIENCE &&
    env.API_OPERATOR_OIDC_JWKS_URL &&
    env.API_OPERATOR_OIDC_CLIENT_ID
  ) {
    // D-034: operator MFA is verified once, from the ID token at login, and bounds the session.
    identity.operator = {
      issuer: env.API_OPERATOR_OIDC_ISSUER,
      apiAudience: env.API_OPERATOR_OIDC_AUDIENCE,
      clientId: env.API_OPERATOR_OIDC_CLIENT_ID,
      keys: createRemoteJWKSet(new URL(env.API_OPERATOR_OIDC_JWKS_URL)),
      mfaMaxAgeSeconds: env.API_OPERATOR_MFA_MAX_AGE_SECONDS,
      idleSeconds: env.API_OPERATOR_SESSION_IDLE_SECONDS,
    };
  }

  const app = await createApp({
    logger,
    identity,
    corsAllowedOrigins: API_CORS_ALLOWED_ORIGINS,
    hsts: PRODUCTION_LIKE.has(APP_ENV),
    database: db,
    operatorDatabase: operatorDb,
    trustedProxies: env.API_TRUSTED_PROXIES,
  });
  await app.listen(API_PORT, API_HOST);
}

await main();
