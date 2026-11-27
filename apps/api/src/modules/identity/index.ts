// Public surface of the identity module (other modules import only from index.ts).
export { IdentityModule } from './identity.module.js';
export {
  BffGuard,
  BFF_CREDENTIAL_HEADER,
  bffCredentialMatches,
  IDENTITY,
  OperatorGuard,
  OwnerGuard,
} from './guards.js';
export type { IdentityConfig, IdentityDomainConfig } from './guards.js';
export { verifyLogin, accessTokenHash } from './login-verifier.js';
export type { LoginDomainConfig, VerifiedLogin } from './login-verifier.js';
export type { Principal } from './session.service.js';
