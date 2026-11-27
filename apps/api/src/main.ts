import { createApp } from './create-app.js';
import { parseApiEnv, PRODUCTION_LIKE } from './env.js';
import { JsonLogger } from './logging/json-logger.js';

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
  const app = await createApp({
    logger: new JsonLogger({ level: API_LOG_LEVEL }),
    corsAllowedOrigins: API_CORS_ALLOWED_ORIGINS,
    hsts: PRODUCTION_LIKE.has(APP_ENV),
  });
  await app.listen(API_PORT, API_HOST);
}

await main();
