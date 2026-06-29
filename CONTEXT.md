# CONTEXT.md

> **Канонический контекст проекта NB.** Это главный документ: что это, как устроено, что реализовано, какие инварианты и правила.
> Читать первым. Краткая памятка для агентов — `CLAUDE.md`. Онбординг/запуск — `README.md`.
> Глубокие технические референсы по подсистемам — в `docs/reference/` (см. раздел 16).
>
> **Обновлено:** 2026-06-28.
> Если документ и код расходятся — **код важнее**; документ синхронизируй или явно отмечай расхождение.

---

## 1. Что это за проект

**NB** — web-first платформа для домашних пивоваров (homebrewing). Не forum-first, не store-first.

**Продуктовый workflow:**
```
Каталог ингредиентов / Мой каталог → Мой склад (инвентарь) → Рецепты → Public recipes → BJCP/контент
```

Две петли (источник истины по порядку — `docs/roadmap.md`): **мастерская** (рецепт → склад → Match → варка → журнал замеров → дашборд; retention) и **витрина** (публичные рецепты, BJCP, калькуляторы; acquisition).

**Продуктовые цели:**
- Вести карточки кастомных ингредиентов и личный каталог
- Нормализовать и хранить инвентарь со стандартизованными единицами
- Собирать рецепты из структурированных ингредиентов
- Публиковать рецепты публично, давать сообществу discovery (фильтры, рейтинги, сохранения)
- Развивать BJCP/knowledge-base слой поверх доменного ядра
- Match Engine (рецепт vs склад) и Brew Session (жизненный цикл варки + журнал замеров) — **реализованы** (Track B). Текущий фронтир: виртуальный «гид варочного дня» и интеграция устройств BrewForge

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
6. **Public recipe access** — только через recipe service (`getPublicRecipeBySlug`, `searchPublicRecipes`); slug/visibility/publication gating проверяются серверно.
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
| `/guides`, `/guides/[slug]` | **Контент-CMS (Track A):** хаб гайдов/обзоров и страница статьи из `content_articles` (Tiptap JSON → React, SEO + JSON-LD). Cache-safe (не читают сессию) |
| `/login` | Мультиметодная авторизация: OTP, Magic Link, Password, OAuth (Google/VK/Yandex) |

### Авторизованные роуты `(app)` — требуют логин (`requireUser()`), обёрнуты в `AppShell`

| URL | Что реализовано |
|-----|-----------------|
| `/app` | Дашборд-командный центр: «Активные варки» (сорт. по срочности подсказки `resolveBrewNudge`), «Можно сварить сейчас» (свои ready-рецепты, `findBrewableOwnRecipesForUser`), статы, быстрые входы, discover. Секции count-conditional. Подробности — `docs/roadmap.md` Track B #6 |
| `/app/recipes` | Хаб «Рецепты» с табами Мои (`/app/recipes`) / Сохранённые (`/app/saved`) / Найти (`/recipes`); вкладка «Мои» — список своих рецептов |
| `/app/recipes/new` | Создание/редактирование рецепта (query `recipeId`, `addSource`+`addId`) |
| `/app/recipes/[id]` → `/edit` | Полный редактор рецепта (owned, 404 если не владелец) |
| `/app/saved` | **Избранное** — сохранённые публичные рецепты (`listSavedRecipes`) |
| `/app/ingredients` | Мой склад/инвентарь, фильтры, сортировка, inline-редактирование |
| `/app/equipment` | Профили оборудования (CRUD, default, дублирование) |
| `/app/brew-batches` | Список варок: активные (planned/brewing/fermenting) + история |
| `/app/brew-batches/[id]` | Деталь варки — «центр управления»: статус-степпер, **гид варочного дня** (живой чек-лист из `brewPlanSnapshot` с таймерами, при `device_id = NULL`), журнал замеров OG/FG (ABV/сбраживание vs цели), **секция «Склад»** (списание/возврат ингредиентов), заметки; live-дашборд устройства + телеметрия секцией при `device_id` |
| `/app/devices` | Устройства BrewForge: список, пайринг (код), статус online/offline |
| `/app/devices/[id]/settings` | Деталь/настройки устройства (конфиг, токены, отзыв доступа) |
| `/profile`, `/settings` | Профиль (email/роль read-only, displayName, preferred currency); `/settings`→`/profile` |

> Примечание: каталог переехал в публичную зону (`(public)/catalog`, URL `/catalog`); в `(app)` остались user-only flows.

### Админ-роуты `(admin)` — требуют роль editor+ (`requireContentRole("editor")`)

| URL | Роль | Что |
|-----|------|-----|
| `/admin` | editor | Навигационный хаб |
| `/admin/articles` (+ `/new`, `/[id]/edit`) | editor | **Контент-CMS:** список статей/обзоров, Tiptap-редактор (персистит в `content_articles`), publish/feature/delete по ролям (moderator+ публикует/выводит на главную) |
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
| **recipes** | Рецепты: CRUD, версии, расчёты, water-план, equipment, публикация, **public discovery, рейтинги, сохранения, Match (рецепт vs склад), клон чужого, пересчёт под объём** | `service.ts` (incl. `searchPublicRecipes`, `cloneRecipeFromPublic`), `match-service.ts` (matchLineAgainstInventory/computeRecipeMatch/computeRecipeMatchesForUser/findBrewableOwnRecipesForUser), `brewability-badge.ts` (`resolveBrewabilityBadge`), `scale.ts` (`scaleRecipeToVolume`), `public-recipe-query.ts`, `recipes-url.ts`, `style-search.ts`, `range-slider.ts`, `water-plan.ts`, `water-*.ts`, `fg-estimate.ts`, `beer-color.ts`, `inventory-service.ts` (stock coverage), `publication-validation.ts`, `units.ts` |
| **equipment / equipment-profiles** | Пресеты и конфигурация оборудования юзера | list/get/create/duplicate/setDefault/update/delete |
| **content** | BJCP-каталог (file-backed), отображение статей, role-based модерация | `bjcp-catalog.ts`, `permissions.ts` |
| **content-articles** | Контент-CMS (Track A): редакторские гайды/обзоры в БД — CRUD, role-gating, slug, reading-time, публичные/админ-чтения | `service.ts`, `contracts.ts`, `slug.ts`, `reading-time.ts`; рендер `components/content/tiptap-content.tsx`, редактор `content-body-editor.tsx`/`article-editor-form.tsx` |
| **recipe-images** | Загрузка/обработка/хранение фото (варианты + blur hash) | `service.ts`, S3-адаптер |
| **calculators** | Каталог калькуляторов (статические определения) | `catalog.ts` |
| **brew-batches** | Жизненный цикл варки из рецепта (immutable snapshot): создание, список/деталь, статус-степпер, журнал замеров OG/FG, заметки, телеметрия; дашборд-подсказки; **гид варочного дня** + **списание склада** | `service.ts` (createBrewBatchFromRecipe/listActiveBrewBatchesForUser/updateBrewBatchStatus/addBrewMeasurement/listBrewMeasurements/getBrewBatchTelemetryHistory/`setBrewDayStepState`), `brew-plan.ts` (`buildBrewPlanSnapshot`), `brew-day.ts` (`buildBrewDaySteps`/`normalizeBrewDayProgress`/`applyBrewDayStepPatch`), `inventory.ts` (`consumeBrewBatchInventory`/`restoreBrewBatchInventory`/`getBrewBatchInventoryView` — привязка к `brewBatchId`, откат при отмене), `measurements.ts` (`summarizeBrewMeasurements`), `dashboard.ts` (`resolveBrewNudge`, `STALE_MEASUREMENT_DAYS`), `components/*` (incl. `brew-day-guide`, `brew-inventory`) |
| **brew-controller** | Контур исполнения варки на устройстве BrewForge: провайдер + транслятор рецепта + два транспорта (LAN-REST и облако) | `brewforge-provider.ts` (активный; `transportForDevice` выбирает LAN vs облако), `translator.ts`, `transport.ts` (LAN-REST по `localUrl`, SSRF-гард), **`cloud-transport.ts` + `mqtt-client.ts` (облачный путь «варка откуда угодно»: телеметрия из `brew_telemetry`, команды/рецепт публикуются в брокер, ack коррелируется по `cmd.id`)**, `actions.ts` (`startBrewOnDeviceAction`: openSession→push→START_BREW — работает по обоим транспортам), `contracts.ts`. `device_commands.id = cmd.id` (корреляция ack моста). `rapt-cloud-provider.ts` — выключенная заглушка |
| **devices** | Пайринг/управление устройствами BrewForge: коды пайринга, токены, статус, конфиги | `service.ts` (createPairingCode/claimDevice/findDeviceByToken/updateDeviceStatus/revokeDevice), `profiles.ts`, `actions.ts`, `components/*` |
| **system** | Валюты, деньги (минорные единицы, Intl-форматирование) | `currency.ts`, `money.ts` |
| **forms** | Общие form-хелперы | `numeric-validation.ts` |

**Рейтинги/сохранения:** реализованы в `features/recipes/service.ts` + server actions (`(public)/recipes/save-actions.ts`, `(public)/recipes/[slug]/actions.ts`). Звёзды 1–5, агрегаты денормализованы на `recipes` (`rating_avg`, `rating_count`, `save_count`), пересчёт транзакционно в сервисе.

**Match Engine (рецепт vs склад)** — реализован (`features/recipes/match-service.ts`): построчный матч против склада, доля покрытия по типам ингредиентов, недостающие/частичные позиции, дрожжи по наличию штамма (`presenceBased`), бренд-каскад через `groupKey`. Чистый `resolveBrewabilityBadge` (`brewability-badge.ts`; порог ≥70% типов И ≤2 недостающих; «можно сварить» = есть все типы). UI: `RecipeMatchBadge`/`RecipeMatchPanel`/`RecipeMatchProvider` (after-hydration, cache-safe) на карточках/публичной странице + «добавить на склад» из панели. Тесты: `recipe-match-service.test.ts`, `brewability-badge.test.ts`.

---

## 8. База данных (`packages/db/src/schema.ts`)

### Enums (основные)
`userRole` (user/editor/moderator/admin), `verificationType`, `ingredientType`, `ingredientStatus` (draft/active/archived/merged), `hopForm`, `yeastType/yeastForm`, `inventoryUnitDimension` (weight/volume/count), `inventoryPriceInputMode` (total/per_display_unit), `systemCurrency` (RUB/USD/EUR), `recipePublicationState` (draft/private/published), `recipeIngredientStage`, `recipeInventoryAllocationStatus`, `inventoryTransactionType`, `brewBatchStatus`, `brewDeviceStatus` (online/offline/unknown), `deviceCommandStatus` (queued/sent/acked/failed), `recipeImageStatus`.

### Таблицы по доменам

**Auth/User:** `users`, `sessions`, `accounts` (OAuth), `verifications`, `authRateLimits`.

**Система:** `systemCurrencyRates` (rubMinorPerUnit), `systemEvents`.

**Каталог ингредиентов:** `ingredients` (основной runtime), `ingredientAliases`, `ingredientSources`, `ingredientPackageVariants`, `ingredientFamilies` (matchPolicy: exact_only/family_compatible), `ingredientCatalogItems` (**legacy**), `proposedIngredients` (очередь модерации).

**Пользовательский домен:** `userCustomIngredients`, `userIngredientPreferences` (isFavorite), `userIngredientPurchaseLinks`, `userIngredients` (**инвентарь**: entered+normalized, pricing в минорных единицах + валюта, purchasedAt, freshnessDate, archivedAt), `userBrewingSettings`.

**Оборудование:** `equipmentProfiles` (targetBatchVolumeL, brewhouseEfficiencyPct, evaporationRateLPerHr, grainAbsorptionLPerKg, hopUtilizationFactor, altitudeM, isDefault).

**Рецепты:**
- `recipes` — authorId, recipeFamilyId + versionNumber, publicationState, slug (UNIQUE), batchSize (entered+normalized), og/fg/abv/ibu/color, `rating_avg` / `rating_count` / `save_count` (денормализованные агрегаты), JSONB meta (processMeta/calculationMeta/waterPlanMeta/brewPlanMeta/equipmentProfileSnapshot), heroImageId, `cloned_from_recipe_id` (провенанс клона чужого, self-FK ON DELETE SET NULL; не путать с recipeFamilyId+versionNumber)
- `recipeIngredients` — persistentKey (стабилен между версиями), source linkage, amount (entered+normalized), stage, timeOffset, stepMeta
- `recipeImages` — storageKey по вариантам, blurDataUrl, isCover, status, soft-delete
- `recipeRatings` — stars 1–5 (check), unique (recipeId, userId); источник для `rating_avg`/`rating_count`
- `recipeSaves` — unique (recipeId, userId); источник для `save_count`

**Brew/варка:** `brewBatches` (snapshot рецепта/оборудования/воды + `device_id` + `brew_day_progress` jsonb — прогресс гида варочного дня, миграция 0038), `brewMeasurements` (журнал SG/OG/FG, миграция 0037). **Allocation:** `recipeInventoryAllocations`, `inventoryTransactions` — пишутся при списании на варку (`features/brew-batches/inventory.ts`, привязка через `inventory_transactions.brew_batch_id`).

**Контент-CMS:** `contentArticles` (миграция 0039) — type (guide/review), status (draft/published/archived), slug (UNIQUE), bodyJson (Tiptap), metaJson, coverImageUrl, seo*, readingMinutes, isFeatured, authorId/reviewerId, publishedAt. BJCP сюда НЕ пишется (остаётся file-backed `@nb/content`).

**Устройства BrewForge:** `brewDevices`, `devicePairingTokens`, `brewTelemetry`, `brewLogEvents`, `deviceCommands`, `deviceProfiles` (миграции 0034–0036).

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

### @nb/brewforge-protocol
Замороженный zod-контракт протокола nb ↔ контроллер BrewForge (прошивка зеркалит в cJSON). `type:module`, импорты с `.js` на `.ts` → добавлен в `transpilePackages` + `resolve.extensionAlias` в `apps/web/next.config.ts`. Транспорт/мост вне `apps/web`: `apps/bridge` (MQTT↔WS↔Postgres), симулятор устройства — `apps/device-sim`.

### @nb/search
**Только scaffold** — НЕ основной search runtime. Реальный поиск в `features/ingredients`.

---

## 10. Компоненты (`apps/web/components/*`)

| Директория | Ключевые компоненты |
|-----------|---------------------|
| **app/** | `app-shell.tsx` (+ мобильный drawer/bottom-nav), `app-sidebar-nav.tsx`, `section-skeletons.tsx` |
| **shared/** | `site-header.tsx`, `site-footer.tsx`, `public-shell.tsx` (дуальный хром: залогиненному на витрине справочники открываются в сайдбаре), `confirm-action-dialog.tsx`, `country-flag.tsx` |
| **ingredients/** | `ingredient-picker.tsx` (большой общий picker с поиском/quick-start/favorite), `admin-ingredient-form.tsx`, `custom-catalog-ingredient-form.tsx`, `ingredient-catalog-toolbar.tsx`, `duplicate-merge-form.tsx`, `moderation-queue.tsx` |
| **inventory/** | `catalog-ingredient-form.tsx`, `custom-ingredient-form.tsx`, `inventory-item-details-editor.tsx`, `inventory-list-item.tsx`, `add-ingredient-modal.tsx`, `inventory-consume-control.tsx`, `inventory-inline-quantity-editor.tsx`, `inventory-toolbar.tsx`, `grouped-inventory-list.tsx` |
| **recipes/** | **`recipe-designer.tsx` (крупнейший компонент, архитектурный блокер).** Редактор: `recipe-editor-page.tsx`, `recipe-ingredients-editor.tsx`, `recipe-stats-summary.tsx`, `recipe-water-additives-section.tsx`, `import-export-modal.tsx`. Public/discovery: `public-recipe-page.tsx`, `recipe-card.tsx`, `recipes-grid.tsx`, `recipes-results.tsx`, `recipes-toolbar.tsx`, `recipes-filter-sidebar.tsx`, `recipes-filter-sheet.tsx`, `recipes-filter-controls.tsx`, `recipes-range-slider.tsx`, `recipes-color-scale.tsx`, `recipe-style-picker.tsx`, `recipes-pagination.tsx`, `active-filter-chips.tsx`, `recipe-rating-form.tsx`, `recipe-save-button.tsx`, `recipe-saves-provider.tsx`, `use-recipe-query.ts`. **Match/варка-мост:** `recipe-match-badge.tsx`, `recipe-match-panel.tsx`, `recipe-match-provider.tsx`, `recipe-tabs.tsx`. **Клон/масштаб:** `clone-from-public-button.tsx`, `clone-recipe-button.tsx`, `recipe-clone-attribution.tsx`, `recipe-scale-panel.tsx`, `saved-toast.tsx` |
| **content/** | `bjcp-catalog.tsx`, `bjcp-style-card.tsx`, `bjcp-article-page.tsx`, `rich-text-editor.tsx` (Tiptap), `article-card.tsx` |
| **equipment/**, **calculators/** | Конфигурация оборудования, страницы калькуляторов |
| **features/brew-batches/components/**, **features/devices/components/** | Варка: `brew-journal`, `brew-lifecycle`, `brew-notes`, `brew-on-device-modal`, `live-dashboard`, `telemetry-chart`. Устройства: `devices-manager`, `device-config-form` |

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
| **6 — Match Engine** (рецепт vs склад) | ✅ `match-service.ts` + `resolveBrewabilityBadge` + badge/panel/provider UI + «добавить на склад»; тесты. Подробности — `docs/roadmap.md` Track B #2–4 |
| **7 — Brew Session** (жизненный цикл варки) | ✅ `/app/brew-batches` список+деталь, статус-степпер, журнал замеров OG/FG (`brew_measurements`, миграция 0037), заметки, дашборд-подсказки (`resolveBrewNudge`); **виртуальный «гид варочного дня»** (рендер `brewPlanSnapshot` живым чек-листом с таймерами/отметками для `device_id = NULL`, колонка `brew_day_progress`, миграция 0038, `features/brew-batches/brew-day.ts`); **списание склада на варку** (`features/brew-batches/inventory.ts`: consume/restore с привязкой к `brewBatchId`, авто-откат при отмене, переиспользует движок `recipeInventoryAllocations`/`inventoryTransactions`) |
| **7b — BrewForge devices** (автоматический режим варки) | ✅ построено и подключено: `@nb/brewforge-protocol`, `features/brew-controller` (BrewForge-провайдер) + `features/devices` (пайринг/токены), `/app/devices`, транспорты LAN + cloud (`apps/bridge`), симулятор `apps/device-sim`, миграции 0034–0036. Параллельный трек; прошивка/телеметрия — внешний репо `../brewforge`. Реф: `docs/brewforge-integration.md` |
| **8 — Content/SEO** (home, BJCP, style pages, featured, sitemap, content roles, Tiptap lab) | ✅ Phase 1–3: таблица `content_articles` (миграция 0039) + сервис `features/content-articles` (CRUD, role-gating, slug, reading-time) + админ-CRUD `/admin/articles` (Tiptap-редактор, publish/feature/delete по ролям) + публичный хаб `/guides` и страница `/guides/[slug]` (Tiptap→React рендер, SEO/JSON-LD); главная переделана в хаб гайдов. ⚠️ Phase 4 впереди: реальный upload обложек/OG-images (пока coverImageUrl как текст). См. `docs/articles-rollout-plan.md` |

**Следующий логичный шаг (источник истины по порядку — `docs/roadmap.md`):** Track A Phase 4 (upload обложек/storage adapter/OG-images по `docs/articles-rollout-plan.md`). Сквозной харднинг безопасности/перфа — по `docs/improvement-recommendations.md` (P1 до prod). Параллельно — housekeeping: одна модель каталога, не две.

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

**Доменные (не из аудита 2026-06-23):**
- Списание склада при варке подключено (`features/brew-batches/inventory.ts`, привязка к `brewBatchId`, откат при отмене). Остаточный риск: операции consume/restore не под строгим row-lock (нет `SELECT … FOR UPDATE` в общем движке аллокаций) — два одновременных запроса одного юзера (две вкладки) теоретически могут разойтись в учёте; для single-owner ресурса риск низкий, дедуп защищён рецепт-скоупным гардом `recipeHasConsumedAllocations`. Полный фикс — локи в `recipes/inventory-service.ts`.
- Известные расхождения калькулятора рецептов: FG без несбраживаемых сахаров/кристального солода, IBU вирпула/first-wort, формула SRM — `docs/recipe-stats-divergence.md`. Низкий риск (числа карточек идут из источника), но блокирует доверие к калькулятору для пользовательских рецептов.
- `@nb/brewing-core generateBrewSteps` без рантайм-потребителя в `apps/web` (snapshot строит `buildBrewPlanSnapshot`) — решить: адаптировать или удалить.

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
- `docs/roadmap.md` — мастер-роадмап продукта (порядок шагов, Track B/A, режимы варки) — **источник истины по статусу/порядку работ**
- `docs/improvement-recommendations.md` — аудит P1–P3 (актуальный, исполнено ~0%)
- `docs/articles-rollout-plan.md` — roadmap editorial/article CMS (Phase 1 сделан, 2–4 впереди)
- `docs/brewforge-integration.md` — интеграция устройств BrewForge (референс)
- `docs/recipe-stats-divergence.md` — диагностика точности калькулятора рецептов
- `docs/specs/recipes-plan-clone-scale.md` — спека «сохранить → клон чужого → пересчёт под объём» (реализована)

---

## 17. Ключевые файлы

| Путь | Назначение |
|------|-----------|
| `CONTEXT.md` | Этот файл — канонический контекст (читать первым) |
| `CLAUDE.md` | Краткая памятка для агентов |
| `README.md` | Онбординг / локальный запуск |
| `docs/roadmap.md` | Мастер-роадмап (источник истины по статусу/порядку работ) |
| `docs/reference/` | Глубокие технические референсы |
| `apps/web/lib/auth.ts` | Auth gating + dev login |
| `apps/web/components/recipes/recipe-designer.tsx` | Крупнейший компонент (архит. блокер) |
| `apps/web/features/ingredients/service.ts` | Каталог CRUD, search |
| `apps/web/features/inventory/service.ts` | Сервис склада |
| `apps/web/features/recipes/service.ts` | Рецепты CRUD, версионирование, рейтинги/сохранения |
| `packages/db/src/schema.ts` | Вся DB-схема |
| `packages/brewing-core/src/` | Расчёты, style fit |
| `packages/content/src/` | BJCP/контент |
