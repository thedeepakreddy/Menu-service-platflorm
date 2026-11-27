import { createApp } from './create-app.js';
import { parseApiEnv } from './env.js';

async function main(): Promise<void> {
  const parsed = parseApiEnv(process.env);
  if (!parsed.ok) {
    // No logger exists yet; write directly to stderr. Values are never printed.
    const lines = parsed.issues.map((issue) => `  - ${issue.variable} ${issue.problem}`);
    process.stderr.write(`Invalid API configuration; refusing to start:\n${lines.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  const { API_HOST, API_PORT } = parsed.env;
  const app = await createApp();
  await app.listen(API_PORT, API_HOST);
}

await main();
