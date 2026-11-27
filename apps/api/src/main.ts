import { createApp } from './create-app.js';
import { parseApiEnv, PRODUCTION_LIKE } from './env.js';
import { assertSafeRuntimeRole, createDatabase } from './infrastructure/database/database.js';
import { JsonLogger } from './logging/json-logger.js';
import { redactString } from './logging/redact.js';

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
  try {
    await assertSafeRuntimeRole(db);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    process.stderr.write(`Database check failed; refusing to start: ${redactString(message)}\n`);
    await db.destroy();
    process.exitCode = 1;
    return;
  }

  const app = await createApp({
    logger,
    corsAllowedOrigins: API_CORS_ALLOWED_ORIGINS,
    hsts: PRODUCTION_LIKE.has(APP_ENV),
    database: db,
  });
  await app.listen(API_PORT, API_HOST);
}

await main();
