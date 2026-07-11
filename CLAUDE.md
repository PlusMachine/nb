# CLAUDE.md

Краткая памятка по проекту для агентов. Подробности архитектуры — в `CONTEXT.md`, обзор — в `README.md`, глубокие технические референсы по подсистемам — в `docs/reference/`.

## Что это
Web-first платформа для домашних пивоваров. Продуктовый workflow:
**Каталог ингредиентов → Мой склад → Рецепты → Public recipes → BJCP/контент**.
Не forum-first и не store-first.

## Архитектура
Modular monolith: один runtime `apps/web`, одна БД PostgreSQL, монорепо (npm workspaces). Доменная логика — в reusable пакетах и feature-сервисах. Без лишней микросервисности.

## Стек
- Next.js 15 (App Router) + React 18 + TypeScript strict
- Tailwind CSS + shadcn-style примитивы (`packages/ui`)
- PostgreSQL + Drizzle ORM (`packages/db`)
- Vitest (тесты), Docker Compose (локальная инфра)
- Sentry / PostHog / Storage — adapter-скелеты

## Раскладка монорепо
- `apps/web` — основной рантайм
  - `app/` — роуты: `(public)`, `(app)` (требует логин), `(admin)` (роль editor+), `api/`
  - `features/*` — service layer; контракты в `features/*/contracts.ts`
  - `components/`, `lib/`, `tests/` (vitest)
- `packages/db` — schema (`src/schema.ts`), миграции, seed/reset скрипты
- `packages/auth` — `@nb/auth`: session/password/OAuth foundation
- `packages/brewing-core` — расчёты, style fit, brew-steps
- `packages/content` — BJCP/content data layer
- `packages/ui`, `packages/shared` — UI-примитивы и общие контракты/утилиты
- `packages/search` — пока scaffold, не основной search runtime

## Source of truth
- DB-модель: `packages/db/src/schema.ts`
- Service layer: `apps/web/features/*` + `features/*/contracts.ts`
- Domain-пакеты: `@nb/auth`, `@nb/brewing-core`, `@nb/content`
- Runtime-каталог сейчас живёт в основном на таблицах `ingredients` + `ingredient_aliases` + `ingredient_sources` + `ingredient_package_variants`

## Команды (из корня)
- `npm run dev` — авто `db:migrate` + `db:seed`, затем Next.js
- `npm run build` / `npm run lint` / `npm run typecheck` / `npm run test` — по всем workspace
- БД: `npm run db:generate | db:migrate | db:seed | db:reset`
- Синк каталога ингредиентов из `ingredients/new/*.json` в БД (без сброса): `npm run catalog:sync`
- Точечный typecheck web: `npx tsc -p apps/web/tsconfig.json --noEmit`

## Dev/Test доступ
CLI-only утилиты (нет UI-кнопок и публичных эндпоинтов):
- `npm run seed:dev-user -- --email <e> --display-name <n> --role <r> --verified true`
- `npm run set-role -- --email <e> --role <user|editor|moderator|admin>`
- `npm run seed:qa` — QA-юзеры (admin/moderator/editor/user) + каталог + инвентарь
- `npm run seed:sample [-- --email <e>]` — наполняет аккаунт (по умолчанию `DEV_AUTH_EMAIL`) тестовыми данными: склад + 2 профиля оборудования + 6 рецептов разных стилей/статусов. Идемпотентно (метит данные `seedSource="sample-data"`). Скрипт: `apps/web/scripts/seed-sample-data.ts`
- `npm run seed:articles [-- --force]` — публикует редакционные статьи из репозитория (`apps/web/scripts/content-articles/*`) в `content_articles` (`/articles/<slug>`). Существующие записи по умолчанию не трогает, `--force` перезаписывает контент из репо. Скрипт: `apps/web/scripts/seed-content-articles.ts`

Авторизация: кастомный `@nb/auth`, HTTP-only cookie `nb_session`. Гейты в `apps/web/lib/auth.ts` (`getSessionUser`, `requireUser`, `requireRole`) и `features/content/permissions.ts`.

**Dev-автологин без формы входа:** задать `DEV_AUTH_EMAIL` в `.env` (вне production). Тогда любой запрос без сессии трактуется как этот пользователь (создаётся/берётся в БД). Жёстко отключено при `NODE_ENV=production`. Пусто = выключено.

## BrewForge: контракт и совместимость
- Контракт с прошивкой (`../brewforge`) — `@nb/brewforge-protocol` + мост `apps/bridge`; система версий/релизов/OTA — `docs/brewforge-firmware-releases.md`, правила версий прошивки — `../brewforge/docs/RELEASE.md`.
- ⚠ Правки, затрагивающие контракт (схемы/топики в `packages/brewforge-protocol`, эндпоинты устройства, pairing, поле `schema`), запрещено делать молча — сначала спросить владельца про совместимость с прошивками в поле и bump версий.
- Публикация релиза прошивки: `npm run firmware:publish -- --file <bin> --version X.Y.Z --notes "..."`.

## Конвенции
- TypeScript strict; стиль файла подгонять под окружающий код.
- Новую доменную логику класть в `features/*` или соответствующий `@nb/*` пакет, а не в компоненты.
- Перед завершением правок — `npm run typecheck` (или точечный tsc по затронутому workspace).

## Конвенции UI
- Модалки — только через `Dialog`/`Sheet` из `@nb/ui` (Radix-based, focus-trap, scroll-lock); самописных `fixed inset-0` модалок не заводить.
- Меню — через `DropdownMenu` из `@nb/ui`.
- Тосты — через `useToast` (`@nb/ui`), провайдер уже смонтирован в `apps/web/components/providers.tsx`.
- Паттерн «добавление сущности»: модалка — когда выбор из большого набора вариантов; инлайн по URL-параметру (`?mode=create` и т.п.) — когда сущностей мало; отдельная страница — когда это многосекционная форма.
- Деструктивные действия — через `ConfirmActionDialog` (`components/shared/confirm-action-dialog.tsx`), не голый `window.confirm` и не form-submit без подтверждения.
- Числовые поля ввода — через `NumericInput` (`apps/web/components/shared/numeric-input.tsx`).
