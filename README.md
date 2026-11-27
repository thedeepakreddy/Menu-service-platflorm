# Menu-service-platflorm

Multitenant hospitality digital-experience SaaS platform.

- **Specifications and governance:** [`docs/README.md`](docs/README.md)
- **Current phase status:** [`docs/STATUS.md`](docs/STATUS.md)
- **Working in this repository (humans and agents):** [`CLAUDE.md`](CLAUDE.md)

## Quick start

Requires Node.js 24 (`.nvmrc`) and pnpm via Corepack.

```sh
corepack enable
pnpm install
export APP_ENV=development   # required by every app; see apps/*/.env.example
pnpm lint && pnpm typecheck && pnpm test && pnpm arch && pnpm build
pnpm test:e2e                # Playwright smoke tests against the built apps
```
