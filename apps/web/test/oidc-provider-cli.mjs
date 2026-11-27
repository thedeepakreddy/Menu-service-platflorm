// Runs the strict local OIDC test provider as a process, for the browser e2e test (D-034).
// TEST SUPPORT ONLY. Usage (from the repository root):
//   node apps/web/test/oidc-provider-cli.mjs <port> <cert-output-file> <web-origin>
// Writes the provider's throwaway TLS certificate to <cert-output-file> (for NODE_EXTRA_CA_CERTS)
// once it is listening. Synthetic client credentials only.
import { writeFileSync } from 'node:fs';

import { startTestProvider } from './oidc-provider.ts';

const [port = '39443', certFile = 'e2e-oidc-cert.pem', webOrigin = 'http://127.0.0.1:3100'] =
  process.argv.slice(2);

const provider = await startTestProvider({
  clientId: 'owner-web',
  clientSecret: 'synthetic-e2e-client-secret',
  redirectUri: `${webOrigin}/auth/owner/callback`,
  postLogoutRedirectUri: `${webOrigin}/`,
  apiAudience: 'platform-api',
  port: Number(port),
});
writeFileSync(certFile, provider.certPem);
process.stdout.write(`test OIDC provider listening at ${provider.issuer}\n`);
const stop = () => {
  void provider.close().then(() => process.exit(0));
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
