# NB Foundation (Stage 0)

MVP bootstrap for a modular-monolith homebrewing platform.

## Stack
- Next.js App Router + React + TypeScript strict
- Tailwind CSS + shadcn-style UI primitives (`packages/ui`)
- PostgreSQL + Drizzle ORM (`packages/db`)
- Docker Compose for local infra
- Sentry / PostHog / Storage adapters (skeleton integrations)

## Monorepo layout
- `apps/web` — main runtime
- `packages/db` — schema, client, migrations, seed/reset scripts
- `packages/ui` — reusable UI primitives
- `packages/shared` — shared env contracts/utilities
- `packages/{brewing-core,auth,content,search}` — scaffold packages

## Setup
Use Node.js 22.12+ (the CI uses Node.js 22) or Node.js 20.19+, and pnpm 9.15.9.
Node.js 18 is no longer supported by the image-processing dependency.

1. `cp .env.example .env`
2. `npm install`
3. `docker compose up -d`
4. `npm run dev`

`npm run dev` now auto-runs `db:migrate` and `db:seed` before starting Next.js, so local QA users and the ingredient catalog are always refreshed in dev.

## Commands
- `npm run dev`
- `npm run dev:prepare`
- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:seed`
- `npm run db:reset`

## Production and PWA

The web build reads the repository root `.env`, with explicit environment variables taking precedence. Set the deployment `APP_URL` and keep `AUTH_SECRET` stable across builds and running instances. An optional `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (32 bytes encoded as base64) overrides the separate key derived from `AUTH_SECRET`; unchanged Server Actions then retain their identifiers across fresh builds. Secret rotation or a breaking action contract still requires refreshing old tabs.

The service worker is served at `/sw.js` with the current Next `BUILD_ID`. It prepares an anonymous offline document and all required JS/CSS before activation. Required offline assets are kept outside the bounded static cache; one previous offline/static cache is retained for resources already cached by open tabs. Private pages, API responses and mutations are not cached by the worker.

Confirmed logout clears private browser caches and refreshes the document. Other tabs hide their previous account's content until refreshed. The first upgraded load invalidates unattributed legacy device/water caches while retaining the current user's explicitly scoped brew queue; passive session expiry retains that queue for reauthentication by its owner, while confirmed logout clears it. Saved server data is unaffected.

Production PWA checks use `apps/web/e2e/pwa-prod.config.ts` against an already running build. The isolated lifecycle/update checks additionally require `PWA_PRODUCTION_QA=1`, the documented QA database and proxy; see [the QA report](notes/qa-pwa-2026-11-04/README.md).

### DX-1 Dev/Test Access Utilities
All commands below are **dev/test-only utilities**. They are intentionally implemented as CLI scripts only (no UI buttons, no public API endpoints).

#### 1) Create or update a dev test user
```bash
npm run seed:dev-user -- --email qa.user@localhost --display-name "QA Brewer" --role user --verified true
```
- Creates the user if it does not exist.
- Updates `displayName`, `role`, and `emailVerified` if the user already exists.

#### 2) Assign role to an existing user by email
```bash
npm run set-role -- --email qa.user@localhost --role admin
```
- Requires an existing user.
- Roles: `user`, `editor`, `moderator`, `admin`.

#### 3) Seed practical local QA dataset
```bash
npm run seed:qa
```
Seeds/updates:
- QA users: admin, moderator, editor, user
- ingredient catalog examples with at least 10 items in every group (`fermentable`, `hop`, `yeast`, `sugar`, `adjunct`, `fining`, `misc`)
- inventory items for `qa.user@localhost` and `qa.admin@localhost`, covering multiple ingredient groups for manual QA

> `npm run db:seed` now runs the same QA seed utility.

#### 4) Manual QA flow (recommended)
1. Register/sign in a normal account from the app.
2. Confirm the account has normal access only.
3. Promote it with `npm run set-role -- --email <email> --role admin`.
4. Sign in again and verify admin routes are accessible.
5. Run `npm run seed:qa` and validate inventory/catalog flows with seeded users.

## Notes
- UI demo: `http://localhost:3000/ui-playground`
- App/Admin scaffolds: `/app`, `/admin`
- PostHog test event and Sentry test error trigger exist on playground page.
