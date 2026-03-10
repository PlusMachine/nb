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
4. `npm db:migrate`
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

## Notes
- UI demo: `http://localhost:3000/ui-playground`
- App/Admin scaffolds: `/app`, `/admin`
- PostHog test event and Sentry test error trigger exist on playground page.
