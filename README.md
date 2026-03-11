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
1. `cp .env.example .env`
2. `npm install`
3. `docker compose up -d`
4. `npm run db:migrate`
5. `npm run dev`

## Commands
- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:seed`
- `npm run db:reset`

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
- ingredient catalog examples (fermentables/hops/yeast/sugar)
- inventory items for `qa.user@localhost` and `qa.admin@localhost`

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
