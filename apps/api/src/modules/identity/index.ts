// Public surface of the identity module (other modules import only from index.ts).
export { IdentityModule } from './identity.module.js';
export { OperatorGuard, OwnerGuard } from './guards.js';
export type { IdentityConfig } from './guards.js';
export { createIdentityVerifier } from './identity-verifier.js';
export type { IdentityVerifier, VerifierOptions } from './identity-verifier.js';
export type { Principal } from './identity.service.js';
