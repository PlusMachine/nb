# CONTEXT.md

> **Канонический контекст проекта NB.** Это главный документ: что это, как устроено, что реализовано, какие инварианты и правила.
> Читать первым. Краткая памятка для агентов — `CLAUDE.md`. Онбординг/запуск — `README.md`.
> Глубокие технические референсы по подсистемам — в `docs/reference/` (см. раздел 16).
>
> **Обновлено:** 2026-06-25.
> Если документ и код расходятся — **код важнее**; документ синхронизируй или явно отмечай расхождение.

---

## 1. Что это за проект

**NB** — web-first платформа для домашних пивоваров (homebrewing). Не forum-first, не store-first.

**Продуктовый workflow:**
```
Каталог ингредиентов / Мой каталог → Мой склад (инвентарь) → Рецепты → Public recipes → BJCP/контент
```

**Продуктовые цели:**
- Вести карточки кастомных ингредиентов и личный каталог
- Нормализовать и хранить инвентарь со стандартизованными единицами
- Собирать рецепты из структурированных ингредиентов
- Публиковать рецепты публично, давать сообществу discovery (фильтры, рейтинги, сохранения)
- Развивать BJCP/knowledge-base слой поверх доменного ядра
- В будущем: Match Engine (рецепт vs склад), Brew Session (трекинг варки)

---

## 2. Архитектура, стек и инварианты

**Архитектура:** Modular monolith — один runtime (`apps/web`), одна БД PostgreSQL, монорепо (npm workspaces). Доменная логика — в reusable пакетах и feature-сервисах. Без микросервисов и без второй параллельной архитектуры.

**Стек:**
- Next.js 15 (App Router) + React 18 + TypeScript strict
- Tailwind CSS + shadcn-style примитивы (`@nb/ui`)
- PostgreSQL + Drizzle ORM (`@nb/db`)
- Tiptap (rich text), @dnd-kit (drag&drop), sharp (обработка картинок)
- @aws-sdk/client-s3 (storage), Sentry + PostHog (наблюдаемость)
- Vitest (тесты), Docker Compose (локальная инфра: PostgreSQL 16 + Mailpit)

### Архитектурные инварианты (соблюдаются, нарушать нельзя)

1. **Ingredient identity** — ингредиенты это сущности (catalog или user custom), а не free-text. Для inventory и recipes нельзя использовать свободный текст как primary identity, если есть source linkage.
2. **Единый ingredient picker / search foundation** — один `IngredientPicker` и один search flow для catalog/inventory/recipes. Не делать второй picker и второй поиск.
3. **Entered + normalized единицы** — хранятся обе: введённое пользователем значение и каноничное нормализованное. Нормализация только на сервере, никогда на клиенте.
4. **Ownership & permissions на сервере** — нельзя редактировать чужой inventory / custom ingredient / private recipe; admin/content-доступ не должен зависеть только от скрытых кнопок в UI.
5. **Доменная логика в service layer** — расчёты, нормализация, access rules, publication gating, merge logic живут в `features/*` / domain-пакетах, а не в страницах/компонентах.
6. **Public recipe access** — только через recipe service (`getPublicRecipeBySlug`, `listPublicRecipes`); slug/visibility/publication gating проверяются серверно.
7. **Content/BJCP слой** — file-backed через `@nb/content`; не дублировать ad-hoc file parsing в page layer.
8. **Reuse over rebuild** — расширять существующие сервисы/контракты/компоненты, а не строить параллельные слои.

### Что нельзя делать
- писать ad-hoc DB-запросы прямо в page/route layer, если есть сервис
- дублировать business logic или normalization в UI
- делать второй ingredient picker / второй search flow
- строить новые фичи на `@nb/search` scaffold (это не основной search runtime)
- строить «catalog v3» рядом с текущим working catalog runtime на таблицах `ingredients`

---

## 3. Раскладка монорепо, source of truth, команды

```
apps/web              — основной рантайм (Next.js)
  app/                — роуты: (public), (app), (admin), api/
  features/*          — service layer + contracts.ts
  components/         — UI компоненты
  lib/                — утилиты, auth gating
  tests/              — vitest
packages/
  @nb/db              — schema, миграции, seed/reset
  @nb/auth            — session/password/OAuth/OTP/magic-link
  @nb/brewing-core    — расчёты, style fit, brew-steps
  @nb/content         — BJCP/контент data layer (file-backed)
  @nb/ui              — UI-примитивы (shadcn-style)
  @nb/shared          — env-контракты, общие утилиты
  @nb/search          — ТОЛЬКО scaffold, не основной search runtime
```

**Source of truth:**
- DB-модель: `packages/db/src/schema.ts`
- Service layer: `apps/web/features/*` + `features/*/contracts.ts`
- Domain-пакеты: `@nb/auth`, `@nb/brewing-core`, `@nb/content`
- Runtime-каталог живёт на таблицах `ingredients` + `ingredient_aliases` + `ingredient_sources` + `ingredient_package_variants`. Таблица `ingredient_catalog_items` — **legacy слой** в схеме, не основной read/write path.

**Команды (из корня):**
- `npm run dev` — авто `db:migrate` + `db:seed`, затем Next.js
- `npm run build` / `lint` / `typecheck` / `test` — по всем workspace
- `npm run db:generate | db:migrate | db:seed | db:reset`
- `npx tsc -p apps/web/tsconfig.json --noEmit` — точечный typecheck web
- QA: `npm run seed:dev-user -- --email <e> --role <r>`, `npm run set-role`, `npm run seed:qa`

---

## 4. Маршруты / страницы (что реализовано)

### Публичные роуты `(public)` — без авторизации

| URL | Что реализовано |
|-----|-----------------|
| `/` | Главная. Hero про BJCP, featured-статьи, feature-карточки, ссылки на BJCP/калькуляторы/рецепты |
| `/calculators`, `/calculators/[slug]` | Каталог калькуляторов и конкретный калькулятор (client component, инпуты из query, static generation) |
| `/catalog`, `/catalog/*` | **Публичный каталог ингредиентов** (список/детали/custom/new). User-only действия гейтятся для залогиненных |
| `/articles`, `/articles/[slug]` | Legacy-редиректы на `/bjcp` и `/bjcp/[slug]` |
| `/recipes` | Список публичных рецептов с **discovery**: фильтры (sidebar/sheet), range-слайдеры (OG/FG/ABV/IBU/SRM), style-picker, цветовая шкала, пагинация, URL-state |
| `/recipes/[slug]` | Публичный рецепт по slug, полная инфа, рейтинг/сохранение, rich SEO-метаданные |
| `/recipes/id/[id]` | Legacy ID-роут → редирект на slug |
| `/bjcp`, `/bjcp/[slug]` | Каталог стилей BJCP и страница стиля/статьи, static params, SEO, related |
| `/login` | Мультиметодная авторизация: OTP, Magic Link, Password, OAuth (Google/VK/Yandex) |

### Авторизованные роуты `(app)` — требуют логин (`requireUser()`), обёрнуты в `AppShell`

| URL | Что реализовано |
|-----|-----------------|
| `/app` | Дашборд: приветствие, статы (рецепты, in-stock, всего на складе), action-карточки, утилитарные ссылки |
| `/app/recipes` | Список своих рецептов |
| `/app/recipes/new` | Создание/редактирование рецепта (query `recipeId`, `addSource`+`addId`) |
| `/app/recipes/[id]` → `/edit` | Полный редактор рецепта (owned, 404 если не владелец) |
| `/app/saved` | **Избранное** — сохранённые публичные рецепты (`listSavedRecipes`) |
| `/app/ingredients` | Мой склад/инвентарь, фильтры, сортировка, inline-редактирование |
| `/app/equipment` | Профили оборудования (CRUD, default, дублирование) |
| `/profile`, `/settings` | Профиль (email/роль read-only, displayName, preferred currency); `/settings`→`/profile` |

> Примечание: каталог переехал в публичную зону (`(public)/catalog`, URL `/catalog`); в `(app)` остались user-only flows.

### Админ-роуты `(admin)` — требуют роль editor+ (`requireContentRole("editor")`)

| URL | Роль | Что |
|-----|------|-----|
| `/admin` | editor | Навигационный хаб |
| `/admin/articles`, `/admin/articles/new` | editor | Контент-студия BJCP + Tiptap-редактор (лаборатория, не персистит в БД) |
| `/admin/ingredients` (+ `/new`, `/[id]`) | admin | Админ-каталог: фильтры, пагинация, статы, faceted-навигация, CRUD |
| `/admin/ingredients/moderation` | moderator | Очередь модерации предложенных ингредиентов |
| `/admin/ingredients/merge` | moderator | Merge дубликатов (query `sourceId`, `targetId`) |
| `/admin/settings/currency` | admin | Курсы валют (RUB база, USD→RUB, EUR→RUB) |

### Прочее / Layouts
- `/ui-playground` — внутренний QA-инструмент (демо picker, showcase UI, тест PostHog/Sentry)
- Root layout: Providers, SiteFooter, шрифты. `(public)`: SiteHeader. `(app)`: requireUser + AppShell. `(admin)`: requireContentRole("editor")

---

## 5. API роуты

### Auth (`/api/auth/*`)
- `POST /logout`; `POST /otp` (request|verify); `POST /magic` + `GET /magic` (callback); `POST /password` (login|signup|request-reset|reset); `GET /oauth/{google|vk|yandex}` + `/callback`

### Ingredients (`/api/ingredients/*`) — auth
- `GET /search` — поиск по каталогу (system+custom), множество фильтров
- `POST /picker-quick-start` — подсказки для picker (recent + popular)
- `POST /proposals` — предложение ингредиента в модерацию
- `GET /custom` — кастомные ингредиенты юзера

### Recipe Images (`/api/recipe-images/*`) — Node runtime
- `POST /upload` — 4 варианта (original/large/medium/thumb) + blur hash; лимиты 8 картинок/рецепт, 10MB/файл, 40MB/рецепт
- `GET /[imageId]/[variant]` — отдача варианта

### Inventory (`/api/inventory/*`) — auth
- `GET /suggestions` — автокомплит по складу

### Admin (`/api/admin/*`)
- `GET|POST /ingredients`, `GET|PATCH|DELETE /ingredients/[id]` (admin); `POST /ingredients/merge` (moderator); `GET /proposed-ingredients`, `PATCH /proposed-ingredients/[id]` (moderator)

---

## 6. Аутентификация и авторизация

**Файл:** `apps/web/lib/auth.ts`. Кастомный `@nb/auth`, HTTP-only cookie `nb_session`.

| Функция | Назначение |
|---------|-----------|
| `getSessionUser()` | Текущая сессия из cookie + верификация. Dev-автологин если задан `DEV_AUTH_EMAIL` (вне prod) |
| `requireUser()` | Требует логин, иначе редирект `/login` |
| `requireRole(role)` | Требует роль (user=1, editor=2, moderator=3, admin=4) |
| `establishSession(userId)` / `logout()` | Создать / отозвать сессию |

Также `features/content/permissions.ts`: `canEditDrafts` (editor), `canModerate`/`canPublish`/`canFeatureOnHome` (moderator), `canAdminister` (admin).

**Методы входа:** Password, OTP (6 цифр), Magic Link, OAuth (Google/VK/Yandex). TTL: сессия 30 дней, OTP 10 мин, magic link / reset 20 мин.

**Dev-автологин:** `DEV_AUTH_EMAIL` в `.env` (жёстко отключён при `NODE_ENV=production`).

---

## 7. Feature / service layer (`apps/web/features/*`)

| Feature | Назначение | Ключевое |
|---------|-----------|----------|
| **ingredients** | Каталог: search, ranking, admin, custom, таксономии, модерация | `service.ts`, `catalog-service.ts`, `ranking.ts`, `technical-fields.ts`, `presentation.ts`, `taxonomy.ts`, `normalization.ts`, `water-treatment.ts`, `consumables.ts`, `picker-quick-start.ts`, `user-metadata-service.ts` |
| **inventory** | Склад: CRUD, фильтры, сортировка, цены/валюты, suggestions, consume | `service.ts`, `consume.ts`, `purchase-cost.ts`, `custom-ingredient.ts`, `display.ts`, `units.ts`, `pack.ts` |
| **recipes** | Рецепты: CRUD, версии, расчёты, water-план, equipment, публикация, **public discovery, рейтинги, сохранения** | `service.ts`, `public-recipe-query.ts`, `recipes-url.ts`, `style-search.ts`, `range-slider.ts`, `water-plan.ts`, `water-*.ts`, `fg-estimate.ts`, `beer-color.ts`, `inventory-service.ts` (stock coverage), `publication-validation.ts`, `units.ts` |
| **equipment / equipment-profiles** | Пресеты и конфигурация оборудования юзера | list/get/create/duplicate/setDefault/update/delete |
| **content** | BJCP-каталог, отображение статей, role-based модерация | `bjcp-catalog.ts`, `permissions.ts` |
| **recipe-images** | Загрузка/обработка/хранение фото (варианты + blur hash) | `service.ts`, S3-адаптер |
| **calculators** | Каталог калькуляторов (статические определения) | `catalog.ts` |
| **brew-batches** | Brew-сессии из рецептов (immutable snapshot) | `createBrewBatchFromRecipe`, `updateBrewBatchStatus`, `brew-plan.ts` |
| **brew-controller** | Абстракция hardware-провайдеров (RAPT Cloud и пр.) | `rapt-cloud-provider.ts` (интерфейсы) |
| **system** | Валюты, деньги (минорные единицы, Intl-форматирование) | `currency.ts`, `money.ts` |

**Рейтинги/сохранения:** реализованы в `features/recipes/service.ts` + server actions (`(public)/recipes/save-actions.ts`, `(public)/recipes/[slug]/actions.ts`). Звёзды 1–5, агрегаты денормализованы на `recipes` (`rating_avg`, `rating_count`, `save_count`), пересчёт транзакционно в сервисе.

**Match Engine (рецепт vs склад)** — пока groundwork: source linkage + нормализованные количества есть, но матчинга / percent match / missing-ingredients UI ещё нет.

---

## 8. База данных (`packages/db/src/schema.ts`)

### Enums (основные)
`userRole` (user/editor/moderator/admin), `verificationType`, `ingredientType`, `ingredientStatus` (draft/active/archived/merged), `hopForm`, `yeastType/yeastForm`, `inventoryUnitDimension` (weight/volume/count), `inventoryPriceInputMode` (total/per_display_unit), `systemCurrency` (RUB/USD/EUR), `recipePublicationState` (draft/private/published), `recipeIngredientStage`, `recipeInventoryAllocationStatus`, `inventoryTransactionType`, `brewBatchStatus`, `recipeImageStatus`.

### Таблицы по доменам

**Auth/User:** `users`, `sessions`, `accounts` (OAuth), `verifications`, `authRateLimits`.

**Система:** `systemCurrencyRates` (rubMinorPerUnit), `systemEvents`.

**Каталог ингредиентов:** `ingredients` (основной runtime), `ingredientAliases`, `ingredientSources`, `ingredientPackageVariants`, `ingredientFamilies` (matchPolicy: exact_only/family_compatible), `ingredientCatalogItems` (**legacy**), `proposedIngredients` (очередь модерации).

**Пользовательский домен:** `userCustomIngredients`, `userIngredientPreferences` (isFavorite), `userIngredientPurchaseLinks`, `userIngredients` (**инвентарь**: entered+normalized, pricing в минорных единицах + валюта, purchasedAt, freshnessDate, archivedAt), `userBrewingSettings`.

**Оборудование:** `equipmentProfiles` (targetBatchVolumeL, brewhouseEfficiencyPct, evaporationRateLPerHr, grainAbsorptionLPerKg, hopUtilizationFactor, altitudeM, isDefault).

**Рецепты:**
- `recipes` — authorId, recipeFamilyId + versionNumber, publicationState, slug (UNIQUE), batchSize (entered+normalized), og/fg/abv/ibu/color, `rating_avg` / `rating_count` / `save_count` (денормализованные агрегаты), JSONB meta (processMeta/calculationMeta/waterPlanMeta/brewPlanMeta/equipmentProfileSnapshot), heroImageId
- `recipeIngredients` — persistentKey (стабилен между версиями), source linkage, amount (entered+normalized), stage, timeOffset, stepMeta
- `recipeImages` — storageKey по вариантам, blurDataUrl, isCover, status, soft-delete
- `recipeRatings` — stars 1–5 (check), unique (recipeId, userId); источник для `rating_avg`/`rating_count`
- `recipeSaves` — unique (recipeId, userId); источник для `save_count`

**Brew/Allocation:** `brewBatches` (snapshot рецепта/оборудования/воды), `recipeInventoryAllocations`, `inventoryTransactions`.

**Модель нормализации:** юзер вводит "500g"/"1 kg" → сервер нормализует к каноничной единице. Хранятся обе; нормализованная — для расчётов.

---

## 9. Доменные пакеты

### @nb/brewing-core — расчёты (production-grade)
- **gravity.ts:** `calculateOg` (points + efficiency), `calculateFg` (attenuation), `calculateAbv`
- **ibu.ts:** 5 формул — Tinseth Classic, Tinseth Whirlpool V2, Rager, Garetz, Noonan Legacy; boil/FWH/whirlpool/dry-hop, late-boil carryover, altitude, флокуляция, hop utilization factor
- **color.ts:** MCU → SRM (Morey) → EBC
- **water.ts:** `solveWaterTargetProfile` (hill-climbing solver солей), `estimateMashPh` (Kolbach RA, Hybrid v1), `solveMashAcidAddition` (binary search). Соли: gypsum, calcium_chloride, epsom, table_salt, baking_soda, chalk, slaked_lime. Кислоты: lactic, phosphoric
- **calculator-tools.ts:** конвертеры gravity/ABV/attenuation/dilution/boiloff, рефрактометр/ареометр, priming, carbonation, yeast starter, brewing water volume, hop freshness, unit converter
- **scaling.ts:** масштабирование рецепта + пересчёт статов
- **brew-steps/:** `generateBrewSteps`
- **styles/:** BJCP-стили, style fitting

### @nb/content
BJCP-данные (file-backed, не БД): `getArticleBySlug`, `listArticles`, `listFeaturedArticles`, `listRelatedArticles`, `getBjcpCatalogData`.

### @nb/auth
`assertRateLimit`, `getOrCreateUserByEmail`, `issueVerification`, `consumeVerification`, session-management. Password (bcrypt), OAuth, OTP, magic link.

### @nb/ui
Button, Card, Dialog, Input, Select, Slider, Table, Textarea, Toast (Radix). CVA + Lucide.

### @nb/shared
Env-контракты на Zod: `parseServerEnv`, `parseClientEnv`.

### @nb/search
**Только scaffold** — НЕ основной search runtime. Реальный поиск в `features/ingredients`.

---

## 10. Компоненты (`apps/web/components/*`)

| Директория | Ключевые компоненты |
|-----------|---------------------|
| **app/** | `app-shell.tsx`, `app-shell-navigation.tsx`, `section-skeletons.tsx` |
| **shared/** | `site-header.tsx`, `site-footer.tsx`, `confirm-action-dialog.tsx`, `country-flag.tsx` |
| **ingredients/** | `ingredient-picker.tsx` (большой общий picker с поиском/quick-start/favorite), `admin-ingredient-form.tsx`, `custom-catalog-ingredient-form.tsx`, `ingredient-catalog-toolbar.tsx`, `duplicate-merge-form.tsx`, `moderation-queue.tsx` |
| **inventory/** | `catalog-ingredient-form.tsx`, `custom-ingredient-form.tsx`, `inventory-item-details-editor.tsx`, `inventory-list-item.tsx`, `add-ingredient-modal.tsx`, `inventory-consume-control.tsx`, `inventory-inline-quantity-editor.tsx`, `inventory-toolbar.tsx`, `grouped-inventory-list.tsx` |
| **recipes/** | **`recipe-designer.tsx` (крупнейший компонент, архитектурный блокер).** Редактор: `recipe-editor-page.tsx`, `recipe-ingredients-editor.tsx`, `recipe-stats-summary.tsx`, `recipe-water-additives-section.tsx`, `import-export-modal.tsx`. Public/discovery: `public-recipe-page.tsx`, `recipe-card.tsx`, `recipes-grid.tsx`, `recipes-results.tsx`, `recipes-toolbar.tsx`, `recipes-filter-sidebar.tsx`, `recipes-filter-sheet.tsx`, `recipes-filter-controls.tsx`, `recipes-range-slider.tsx`, `recipes-color-scale.tsx`, `recipe-style-picker.tsx`, `recipes-pagination.tsx`, `active-filter-chips.tsx`, `recipe-rating-form.tsx`, `recipe-save-button.tsx`, `recipe-saves-provider.tsx`, `use-recipe-query.ts` |
| **content/** | `bjcp-catalog.tsx`, `bjcp-style-card.tsx`, `bjcp-article-page.tsx`, `rich-text-editor.tsx` (Tiptap), `article-card.tsx` |
| **equipment/**, **calculators/** | Конфигурация оборудования, страницы калькуляторов |

---

## 11. Тесты (`apps/web/tests/`, Vitest)

| Домен | Покрытие |
|-------|----------|
| Ingredients | Service, search, ranking, taxonomy, technical fields, normalization, picker, admin/custom форма, moderation, family backfill |
| Inventory | Service, CRUD, фильтры, price/cost, units, suggestions, inline actions, consume |
| Recipes | Service, editor actions/components, stats, format/interop, publication, water/equipment flows, pages wiring, public query, ratings, saves, style search, range slider, recipes-url, recipe-card, filter sheet, color scale, pagination |
| Прочее | Currency rates, BJCP stats, calculators, country flags, money display, site shell, dashboard wiring |

**Пробелы:** API-роуты в основном не покрыты; пакеты `@nb/auth`/`@nb/ui`/`@nb/shared`/`@nb/search` — 0 тестов; нет e2e; `recipe-designer.tsx` — только статический рендер.

---

## 12. Состояние по стадиям

| Стадия | Статус |
|--------|--------|
| **0 — Foundation** (монорепо, БД, миграции, Docker, Sentry/PostHog skeleton) | ✅ |
| **1 — Auth/Access** (session, RBAC, password/OTP/magic/OAuth, ownership, profile) | ✅ |
| **2 — Brewing Core** (OG/FG/ABV/IBU/color/scaling/priming, units, style ranges, brew-steps) | ✅ |
| **3 — Ingredient Catalog V2** (aliases/sources/variants/тех.поля, search+ranking, picker, admin, модерация, merge, custom, публичный `/catalog`) | ✅ |
| **4 — Inventory** (CRUD + нормализация, фильтры/сортировка, inline edit, archive, suggestions, cost/currency, freshness, consume) | ✅ |
| **5A — Recipe Core** (recipes/recipe_ingredients, версионирование, normalized units, stats) | ✅ |
| **5B — Author-side recipes** (редактор, clone, версии, draft preview, water/equipment meta, BeerXML/JSON import-export) | ✅ |
| **5C — Public Recipes foundation** (slug-URL, listing, publication gating, legacy redirect, SEO) | ✅ |
| **5D — Public discovery + social** (фильтры sidebar/sheet, range-слайдеры, style-picker, цветовая шкала, пагинация, URL-state, recipe-cards, **рейтинги** `recipe_ratings`, **сохранения** `recipe_saves` + `/app/saved`) | ✅ |
| **6 — Match Engine** (рецепт vs склад) | ⚠️ только groundwork (source linkage + нормализация; нет матчинга/percent/missing UI) |
| **7 — Brew Session** (исполнение варки) | ❌ только brew-steps генератор + scaffold `brew-batches`/`brew-controller`; нет полноценного UI/истории/списания склада |
| **8 — Content/SEO** (home, BJCP, style pages, featured, sitemap, content roles, Tiptap lab) | ⚠️ частично; нет generic article CMS (см. `docs/articles-rollout-plan.md`) |

**Следующий логичный шаг:** Stage 6 — Match Engine как реальная фича (exact-match → missing list → percent match → блоки на страницах/карточках рецептов), затем family-compatible/substitutions или Stage 7. Параллельно — housekeeping: окончательно закрепить catalog runtime и не расти на двух моделях каталога.

---

## 13. Известные проблемы (источник: `docs/improvement-recommendations.md`, 2026-06-23)

**P1 — критичные:**
1. Токены аутентификации логируются в `console.info` (`lib/auth.ts`) — риск account takeover
2. Captcha — заглушка (всегда true): auth-эндпоинты не защищены от ботов
3. Magic-link токен в GET-параметрах (попадает в history/proxy/Referer)
4. N+1 запросы в recipe/inventory сервисах
5. `recipe-designer.tsx` — 6000+ строк, бизнес-логика в компоненте → нетестируемо
6. API-роуты и пакеты (`@nb/auth`/`@nb/ui`/`@nb/shared`) — 0 тестов; нет e2e

**P2 — важные:** нет CI-проверок (npm ci, migration drift, coverage); множество `@ts-ignore` и `any`; нет FK-индексов на created_by/submitted_by; «load all → filter in memory» в поиске; дублирование error/Zod-обработки; layer leakage (features импортят из components); `cleanupExpiredVerifications` не вызывается.

**P3 — желательные:** нет Prettier/pre-commit/ESLint-complexity; `@nb/search` — мёртвый scaffold; нет i18n (строки на русском захардкожены); a11y-пробелы; устаревшие зависимости.

---

## 14. Правила для AI coding agent

**Перед изменениями:**
1. Прочитай этот файл, затем посмотри реальный код. При конфликте — код важнее.
2. Используй существующие сервисы, модели, DTO, shared-компоненты.
3. Не строй новые фичи на `@nb/search` scaffold, если задача не про сам пакет.
4. Не строй новые catalog flows так, будто `ingredient_catalog_items` — главный runtime, если задача не про миграцию/cleanup.
5. В отчёте указывай: что нашёл в репозитории, на какие сущности/сервисы опираешься, что добавил, что оставил на следующий пакет.

**Хороший результат:** минимальное расширение существующей архитектуры, reuse сервисов/контрактов/компонентов, сохранение инвариантов, focused-тесты, no parallel architecture.

**Плохой результат:** второй service layer рядом со старым; второй picker/search flow; normalization на клиенте; ad-hoc DB-запросы в route/page; free-text там, где есть entity linkage; ещё одна «версия» каталога.

**Про protected routes и QA:** многие маршруты защищены auth. Screenshot/Playwright без реальной seeded-сессии — слабый сигнал. Основной критерий для protected areas: service/action/component/page-wiring тесты + typecheck. Manual QA полезен только через реального seeded-юзера с реальной сессией и ролью.

---

## 15. Локальный запуск

```bash
cp .env.example .env
npm install
docker compose up -d   # PostgreSQL 16 + Mailpit
npm run dev            # авто migrate + seed, затем Next.js
```

QA-сиды:
```bash
npm run seed:dev-user -- --email qa.admin@localhost --display-name "QA Admin" --role admin --verified true
npm run seed:qa
```

- UI-playground: http://localhost:3000/ui-playground
- Dev-автологин: `DEV_AUTH_EMAIL` в `.env` (вне prod)

---

## 16. Глубокие референсы (`docs/reference/`)

Подробные технические описания подсистем (расчёты, флоу, схемы) вынесены в единый набор референсов. Индекс — `docs/reference/README.md`.

| Документ | О чём |
|----------|-------|
| `docs/reference/recipes-editor.md` | Редактор рецептов (recipe-designer): архитектура, фичи, data model, import/export, batches, изображения |
| `docs/reference/water.md` | Водоподготовка: flow, профили (source/target), salt/acid solver, mash pH, формулы, ограничения |
| `docs/reference/equipment.md` | Профили оборудования: поля, defaults, volume plan, что НЕ влияет на расчёты |
| `docs/reference/recipes-public-page.md` | Публичная страница рецептов: URL-контракт, фильтры, серверный путь, карта компонентов |
| `docs/reference/inventory.md` | Инвентарь: data model, сервис, страница `/app/ingredients`, цены/валюты, normalization |
| `docs/reference/ingredient-add-and-search.md` | Add-flow ингредиента и поиск в picker (ranking, normalization, per-category правила) |
| `docs/reference/ingredient-seed-schema.md` | Структура seed-данных каталогов и критичные несовместимости полей |

Прочие документы в `docs/`:
- `docs/improvement-recommendations.md` — аудит P1–P3 (актуальный)
- `docs/articles-rollout-plan.md` — roadmap editorial/article CMS (Phase 1 сделан, 2–4 впереди)

---

## 17. Ключевые файлы

| Путь | Назначение |
|------|-----------|
| `CONTEXT.md` | Этот файл — канонический контекст (читать первым) |
| `CLAUDE.md` | Краткая памятка для агентов |
| `README.md` | Онбординг / локальный запуск |
| `docs/reference/` | Глубокие технические референсы |
| `apps/web/lib/auth.ts` | Auth gating + dev login |
| `apps/web/components/recipes/recipe-designer.tsx` | Крупнейший компонент (архит. блокер) |
| `apps/web/features/ingredients/service.ts` | Каталог CRUD, search |
| `apps/web/features/inventory/service.ts` | Сервис склада |
| `apps/web/features/recipes/service.ts` | Рецепты CRUD, версионирование, рейтинги/сохранения |
| `packages/db/src/schema.ts` | Вся DB-схема |
| `packages/brewing-core/src/` | Расчёты, style fit |
| `packages/content/src/` | BJCP/контент |
