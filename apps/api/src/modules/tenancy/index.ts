// Public surface of the tenancy module. Other modules may import only from a module's index.ts
// (enforced by tests/architecture).
export { TenancyModule } from './tenancy.module.js';
export { TenancyService } from './tenancy.service.js';
export type { ResolvedTenant } from './tenancy.service.js';
