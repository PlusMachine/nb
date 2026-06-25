# NB — Полный контекст проекта

> Документ для вставки в чат Claude как полный контекст по приложению.
> Web-first платформа для домашних пивоваров. Modular monolith на Next.js 15 + PostgreSQL.
> Дата сборки контекста: 2026-06-24.

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
- Публиковать рецепты публично
- Развивать BJCP/knowledge-base слой поверх доменного ядра
- В будущем: Match Engine (рецепт vs склад), Brew Session (трекинг варки)

---

## 2. Архитектура и стек

**Архитектура:** Modular monolith — один runtime (`apps/web`), одна БД PostgreSQL, монорепо (npm workspaces). Доменная логика — в reusable пакетах и feature-сервисах. Без микросервисов.

**Инварианты (соблюдаются):**
- Ингредиенты — сущности (не свободный текст)
- Единый ingredient picker/search foundation
- Entered + normalized единицы (нормализация на сервере, никогда на клиенте)
- Ownership & permissions проверяются на сервере
- Доменная логика в service layer, не в страницах/компонентах
- Переиспользовать существующие сервисы, а не строить параллельные

**Стек:**
- Next.js 15.5.12 (App Router) + React 18.3.1 + TypeScript strict
- Tailwind CSS 3.4.15 + shadcn-style примитивы (`@nb/ui`)
- PostgreSQL + Drizzle ORM (`@nb/db`)
- Tiptap 3.21 (rich text), @dnd-kit (drag&drop), sharp (обработка картинок)
- @aws-sdk/client-s3 (storage), Sentry + PostHog (наблюдаемость)
- Vitest (тесты), Docker Compose (локальная инфра: PostgreSQL 16 + Mailpit)

---

## 3. Раскладка монорепо

```
apps/web              — основной рантайм (Next.js)
  app/                — роуты: (public), (app), (admin), api/
  features/*          — service layer + contracts.ts
  components/         — UI компоненты
  lib/                — утилиты, auth gating
  tests/              — vitest (~52 файла)
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
- Runtime-каталог живёт на таблицах `ingredients` + `ingredient_aliases` + `ingredient_sources` + `ingredient_package_variants`

**Команды (из корня):**
- `npm run dev` — авто db:migrate + db:seed, затем Next.js
- `npm run build` / `lint` / `typecheck` / `test`
- `npm run db:generate | db:migrate | db:seed | db:reset`
- `npx tsc -p apps/web/tsconfig.json --noEmit` — точечный typecheck web
- QA: `npm run seed:dev-user -- --email <e> --role <r>`, `npm run set-role`, `npm run seed:qa`

---

## 4. Маршруты / страницы (что реализовано)

### Публичные роуты `(public)` — без авторизации

| URL | Что реализовано |
|-----|-----------------|
| `/` | Главная. Hero про BJCP, featured-статьи, 3 feature-карточки, ссылки на BJCP/калькуляторы/рецепты |
| `/calculators` | Список пивоваренных калькуляторов |
| `/calculators/[slug]` | Конкретный калькулятор (client component, инпуты из query-параметров, static generation для всех slug) |
| `/articles`, `/articles/[slug]` | Legacy-редиректы на `/bjcp` и `/bjcp/[slug]` |
| `/recipes` | Список всех публично опубликованных рецептов (`listPublicRecipes()`), empty state |
| `/recipes/[slug]` | Публичный рецепт по slug, полная инфа, rich SEO-метаданные (OG-теги) |
| `/recipes/id/[id]` | Legacy ID-роут → редирект на slug (для SEO) |
| `/bjcp` | Каталог стилей BJCP, поиск, навигация по семействам, Suspense-скелетон |
| `/bjcp/[slug]` | Страница стиля/статьи BJCP, static params, SEO (canonical, OG, twitter), related-статьи (до 3) |
| `/login` | Мультиметодная авторизация: OTP, Magic Link, Password (login/signup/reset), OAuth (Google/VK/Yandex). Client component |

### Авторизованные роуты `(app)` — требуют логин (`requireUser()`), обёрнуты в `AppShell`

| URL | Что реализовано |
|-----|-----------------|
| `/app` | Дашборд. Приветствие, статы (число рецептов, in-stock items, всего на складе), action-карточки (создать рецепт, добавить на склад, открыть каталог), утилитарные ссылки |
| `/app/recipes` | Список своих рецептов, Suspense + skeleton |
| `/app/recipes/new` | Создание/редактирование рецепта. Query: `recipeId` (edit), `addSource`+`addId` (предзаполнить ингредиент). Грузит recipe, stock coverage, images, equipment profiles |
| `/app/recipes/[id]` | Legacy-редирект на `/app/recipes/[id]/edit` |
| `/app/recipes/[id]/edit` | Полный редактор рецепта. Грузит owned recipe, stock coverage, images, equipment profiles. 404 если не найден/не владелец |
| `/app/catalog` | Браузер каталога ингредиентов, поиск/фильтры, Suspense + skeleton |
| `/app/catalog/new` | Создание кастомного ингредиента. Query: `derivedFrom`, `category`, `subtype` |
| `/app/catalog/[source]/[id]` | Детальная карточка ингредиента (`source` = system/custom). Тех. параметры, favorite-toggle, purchase links, aliases, usage stats, действия (на склад / в рецепт / variant / edit/delete) |
| `/app/catalog/custom/[id]/edit` | Редактирование кастомного ингредиента (edit + delete). 404 если не найден |
| `/app/ingredients` | Мой склад/инвентарь, фильтры, Suspense + skeleton |
| `/app/equipment` | Профили оборудования. Query: `edit`, `mode=create`. Создание/редактирование (inline)/дублирование/set-default/удаление. Specs: объём партии, эффективность, испарение |
| `/profile` | Профиль: email + роль (read-only), редактирование displayName и preferred currency. `updateSettingsAction` |
| `/settings` | Редирект на `/profile` |

### Админ-роуты `(admin)` — требуют роль editor+ (`requireContentRole("editor")`)

| URL | Роль | Что реализовано |
|-----|------|-----------------|
| `/admin` | editor | Навигационный хаб: каталог, модерация, merge, контент-студия, валюты |
| `/admin/articles` | editor | Контент-студия BJCP. Role-based возможности, счётчики featured/категорий, ссылка на Tiptap-редактор, грид featured-статей |
| `/admin/articles/new` | editor | Tiptap rich-text редактор статей (лаборатория, пока не персистит в БД) |
| `/admin/ingredients` | admin | Админ-каталог: фильтры (search/category/status/sort), пагинация (100/стр), группировка по бренду, статы (drafts/merged/pending), faceted-навигация, действия (edit/merge/delete) |
| `/admin/ingredients/new` | admin | Форма создания ингредиента (`AdminIngredientForm`) |
| `/admin/ingredients/[id]` | admin | Редактирование ингредиента. 404 если не найден |
| `/admin/ingredients/moderation` | moderator | Очередь модерации предложенных ингредиентов (status=pending) |
| `/admin/ingredients/merge` | moderator | Инструмент merge дубликатов. Query: `sourceId`, `targetId` |
| `/admin/settings/currency` | admin | Курсы валют. Базовая RUB (1.00), редактируемые USD→RUB и EUR→RUB |

### Прочее

| URL | Что |
|-----|-----|
| `/ui-playground` | Внутренний QA-инструмент: демо IngredientPicker, showcase UI-компонентов, тест PostHog/Sentry событий |

### Layouts

- **Root** (`app/layout.tsx`): Providers, SiteFooter, шрифты Montserrat (display) + Rubik (body) с кириллицей. Title "NB"
- **(public)**: SiteHeader (public-вариант) + опц. инфа юзера, max-w-7xl
- **(app)**: requireUser + AppShell (email, displayName)
- **(admin)**: requireContentRole("editor") + admin-заголовок, max-w-6xl

---

## 5. API роуты

### Auth (`/api/auth/*`)
- `POST /logout` — очистить сессию → `{ ok: true }`
- `POST /otp` — `action: request|verify`, email, code. Требует captcha
- `POST /magic` — отправить magic link (email + captchaToken)
- `GET /magic` — callback: email + token → редирект `/app` или `/login?error=magic_link`
- `POST /password` — `action: login|signup|request-reset|reset`. Требует captcha
- `GET /oauth/{google|vk|yandex}` — инициация OAuth (редирект на провайдера)
- `GET /oauth/{provider}/callback` — завершение OAuth (state + code) → `/app` или `/login?error=...`

### Ingredients (`/api/ingredients/*`) — требуют auth
- `GET /search` — поиск по каталогу (system+custom). Параметры: q, type, category, subtype, family, group, manufacturer, favoritesOnly, customOnly, limit, includeCustom. Возвращает items с source
- `POST /picker-quick-start` — подсказки для picker (recent + popular)
- `POST /proposals` — отправить предложение ингредиента в модерацию
- `GET /custom` — список кастомных ингредиентов юзера (q, category, subtype, sort, limit)

### Recipe Images (`/api/recipe-images/*`) — Node runtime
- `POST /upload` — загрузка с обработкой (4 варианта: original/large/medium/thumb + blur hash). MIME: jpeg/png/webp. Лимиты: 8 картинок/рецепт, 10MB/файл, 40MB/рецепт
- `GET /[imageId]/[variant]` — отдача варианта изображения (бинарь + cache headers)

### Inventory (`/api/inventory/*`) — требуют auth
- `GET /suggestions` — автокомплит для поиска по складу. Параметры: q, category, subtype, group, type, limit, finished, stock, archived, dedupe. Возвращает items с cost

### Admin (`/api/admin/*`)
- `GET /ingredients` (admin) — список с фильтрами + facets + pendingProposals
- `POST /ingredients` (admin) — создать ингредиент → 201
- `GET|PATCH|DELETE /ingredients/[id]` (admin) — CRUD одного ингредиента
- `POST /ingredients/merge` (moderator) — merge дубликатов (sourceIngredientId, targetIngredientId, note)
- `GET /proposed-ingredients` (moderator) — список предложений по статусу
- `PATCH /proposed-ingredients/[id]` (moderator) — `action: approve|reject|merge`

---

## 6. Аутентификация и авторизация

**Файл:** `apps/web/lib/auth.ts`. Кастомный `@nb/auth`, HTTP-only cookie `nb_session`.

| Функция | Назначение |
|---------|-----------|
| `getSessionUser()` | Текущая сессия из cookie + верификация токена. Dev-автологин если задан `DEV_AUTH_EMAIL` (вне prod) |
| `requireUser()` | Требует логин, иначе редирект `/login` |
| `requireRole(role)` | Требует роль, иначе редирект `/app`. Веса: user=1, editor=2, moderator=3, admin=4 |
| `establishSession(userId)` | Создаёт session cookie (httpOnly, sameSite=Lax, secure в prod) |
| `logout()` | Отзывает сессию, удаляет cookie |

Также `features/content/permissions.ts`: `canEditDrafts` (editor), `canModerate`/`canPublish`/`canFeatureOnHome` (moderator), `canAdminister` (admin).

**Методы входа:** Password (signup/login/reset), OTP (6-значный код), Magic Link, OAuth (Google/VK/Yandex). TTL: сессия 30 дней, OTP 10 мин, magic link / password reset 20 мин.

**Dev-автологин:** задать `DEV_AUTH_EMAIL` в `.env` (жёстко отключён при `NODE_ENV=production`). Любой запрос без сессии трактуется как этот пользователь.

---

## 7. Feature / service layer (`apps/web/features/*`)

| Feature | Назначение | Ключевое |
|---------|-----------|----------|
| **ingredients** | Каталог: search, ranking, admin, custom, таксономии, модерация | `service.ts` (~900 строк), `catalog-service.ts`, `ranking.ts`, `technical-fields.ts`, `presentation.ts`, `taxonomy.ts`, `normalization.ts`, `water-treatment.ts`, `consumables.ts`, `picker-quick-start.ts`, `user-metadata-service.ts`. Контракты ~689 строк |
| **inventory** | Управление складом: CRUD, фильтры, сортировка, цены/валюты, suggestions | `service.ts` (~1900 строк), `purchase-cost.ts`, `custom-ingredient.ts`, `display.ts`, `units.ts`, `pack.ts` |
| **recipes** | Рецепты: CRUD, версии, расчёты, water-план, equipment, публикация | `service.ts` (~1800 строк), `water-plan.ts`, `water-profile-presets.ts`, `water-target-profiles.ts`, `water-additives-*.ts`, `fg-estimate.ts`, `beer-color.ts`, `inventory-service.ts` (stock coverage), `publication-validation.ts`, `units.ts` |
| **equipment** | Пресеты/дефолты оборудования | `buildNextEquipmentProfileName()`, `buildStarterEquipmentProfileDefaults()` |
| **equipment-profiles** | Конфигурация оборудования юзера (драйвит расчёты объёмов/выходов) | list/get/create/duplicate/setDefault/update/delete |
| **content** | BJCP-каталог, отображение статей, role-based модерация | `bjcp-catalog.ts`, `permissions.ts` |
| **recipe-images** | Загрузка/обработка/хранение фото рецептов (варианты + blur hash) | `service.ts` (~600 строк), S3-адаптер |
| **calculators** | Каталог калькуляторов (статические определения, 15+ типов) | `catalog.ts` |
| **brew-batches** | Brew-сессии из рецептов (immutable snapshot рецепта/оборудования/воды) | `createBrewBatchFromRecipe`, `updateBrewBatchStatus`, `brew-plan.ts` |
| **brew-controller** | Абстракция hardware-провайдеров (RAPT Cloud и пр.) | `rapt-cloud-provider.ts` (интерфейсы) |
| **system** | Валюты, деньги (минорные единицы, Intl-форматирование) | `currency.ts`, `money.ts` |
| **forms** | Утилиты валидации форм | — |

**Match Engine (рецепт vs склад)** — пока groundwork: source linkage и нормализованные количества есть, но самого матчинга/percent match/missing-ingredients UI ещё нет.

---

## 8. База данных (`packages/db/src/schema.ts`)

### Enums (основные)
userRole (user/editor/moderator/admin), verificationType (otp/magic_link/password_reset), ingredientType, ingredientStatus (draft/active/archived/merged), hopForm, yeastType/yeastForm, inventoryUnitDimension (weight/volume/count), inventoryPriceInputMode (total/per_display_unit), systemCurrency (RUB/USD/EUR), recipePublicationState (draft/private/published), recipeIngredientStage (mash/boil/whirlpool/fermentation/packaging/other), recipeInventoryAllocationStatus, inventoryTransactionType (consume/reserve/release/adjustment), brewBatchStatus (planned/brewing/fermenting/completed/cancelled), recipeImageStatus.

### Таблицы по доменам

**Auth/User:** `users` (email, role, passwordHash, preferredCurrency), `sessions` (tokenHash, expiresAt), `accounts` (OAuth provider), `verifications` (OTP/magic/reset codes), `authRateLimits`.

**Система:** `systemCurrencyRates` (rubMinorPerUnit), `systemEvents`.

**Каталог ингредиентов:**
- `ingredients` — основной runtime-каталог (id TEXT, type, nameRu/En, category, brand, producer, attributes JSONB, quantityDefaults)
- `ingredientAliases`, `ingredientSources`, `ingredientPackageVariants`
- `ingredientFamilies` — семейства (matchPolicy: exact_only/family_compatible)
- `ingredientCatalogItems` — **legacy слой** (в схеме, но не основной read/write путь). Содержит типизированные тех. поля (fermentableColorEbc, hopAlphaAcidPct, yeastAttenuationPct и т.д.)
- `proposedIngredients` — очередь модерации

**Пользовательский домен:**
- `userCustomIngredients` — кастомные карточки ингредиентов
- `userIngredientPreferences` (isFavorite), `userIngredientPurchaseLinks`
- `userIngredients` — **инвентарь** (entered + normalized quantity, pricing в минорных единицах + валюта, purchasedAt, freshnessDate, archivedAt). Ровно один источник: catalog / custom / imported
- `userBrewingSettings` — preferredBitternessFormula, waterEngine, mashPhModel

**Оборудование:** `equipmentProfiles` (targetBatchVolumeL, brewhouseEfficiencyPct, evaporationRateLPerHr, grainAbsorptionLPerKg, hopUtilizationFactor, altitudeM, isDefault).

**Рецепты:**
- `recipes` — authorId, recipeFamilyId + versionNumber (версионирование), publicationState, slug (UNIQUE), batchSize (entered+normalized), рассчитанные og/fg/abv/ibu/color, processMeta/calculationMeta/waterPlanMeta/brewPlanMeta/equipmentProfileSnapshot (JSONB), heroImageId
- `recipeIngredients` — persistentKey (стабилен между версиями), source linkage (catalog/custom), amount (entered+normalized), stage, timeOffset, stepMeta (для хмеля: boilTime, alphaAcid)
- `recipeImages` — storageKey по вариантам, blurDataUrl, isCover, status, soft-delete

**Brew/Allocation:**
- `brewBatches` — snapshot рецепта/оборудования/воды, status, deviceHints, таймлайн
- `recipeInventoryAllocations` — allocated/reserved/released/consumed, привязка к recipeIngredient + inventoryItem
- `inventoryTransactions` — consume/reserve/release/adjustment, quantity before/after

**Модель нормализации:** юзер вводит "500g"/"1 kg" → сервер нормализует к каноничной единице. Хранятся обе; нормализованная — для расчётов. **Нормализация только на сервере.**

---

## 9. Доменные пакеты

### @nb/brewing-core — расчёты (production-grade)
- **gravity.ts:** `calculateOg` (points-based + efficiency), `calculateFg` (attenuation), `calculateAbv` ((og-fg)×131.25)
- **ibu.ts:** 5 формул горечи — Tinseth Classic, Tinseth Whirlpool V2, Rager, Garetz, Noonan Legacy. Учитывает boil/first-wort/whirlpool/dip-hop/dry-hop, late-boil carryover, altitude, флокуляцию дрожжей, hop utilization factor
- **color.ts:** MCU → SRM (Morey) → EBC
- **water.ts:** `solveWaterTargetProfile` (hill-climbing solver солей), `estimateMashPh` (модели Kolbach RA, Hybrid v1), `solveMashAcidAddition` (binary search по кислоте). Соли: gypsum, calcium_chloride, epsom, table_salt, baking_soda, chalk, slaked_lime. Кислоты: lactic, phosphoric
- **calculator-tools.ts:** конвертеры gravity (SG/points/Plato/Brix), ABV standard/alternate, attenuation, dilution/boiloff (6 режимов), коррекция рефрактометра (Novotny/Terrill) и ареометра, priming sugar, keg carbonation, bottling, yeast viability/starter, brewing water volume (BIAB/all-in-one/mash+sparge/extract), hop freshness, универсальный unit converter
- **scaling.ts:** масштабирование рецепта + пересчёт статов
- **brew-steps/:** `generateBrewSteps` — пошаговая процедура варки (prep/mash/sparge/boil/hops/whirlpool/chill/fermentation)
- **styles/:** BJCP-стили, style fitting (подбор ближайшего стиля)

### @nb/content
BJCP-данные (file-backed, не БД): `getArticleBySlug`, `listArticles`, `listFeaturedArticles`, `listRelatedArticles`, `getBjcpCatalogData`. Типы: ContentArticle, ArticleStat (IBU/ABV/color bands), BjcpCatalogStyle, BjcpFamily, BeerColorBand.

### @nb/auth
`assertRateLimit`, `getOrCreateUserByEmail`, `issueVerification`, `consumeVerification`, session-management. Password (bcrypt), OAuth (Google/VK/Yandex), OTP, magic link.

### @nb/ui
Button, Card, Dialog (Radix), Input, Select (Radix), Table, Textarea, Toast (Radix). CVA для вариантов, Lucide-иконки.

### @nb/shared
Env-контракты на Zod: `parseServerEnv` (DB, auth secret, SMTP, OAuth, storage, Sentry/PostHog, captcha), `parseClientEnv`.

### @nb/search
**Только scaffold** (`status: "scaffold"`) — НЕ основной search runtime. Реальный поиск — в `features/ingredients`.

---

## 10. Компоненты (`apps/web/components/*`)

| Директория | Ключевые компоненты |
|-----------|---------------------|
| **app/** | `app-shell.tsx`, `app-shell-navigation.tsx`, `section-skeletons.tsx` |
| **shared/** | `site-header.tsx`, `site-footer.tsx`, `confirm-action-dialog.tsx`, `country-flag.tsx` |
| **ingredients/** | `ingredient-picker.tsx` (~108KB, общий picker с поиском/quick-start/favorite), `admin-ingredient-form.tsx`, `custom-catalog-ingredient-form.tsx`, `ingredient-catalog-toolbar.tsx`, `duplicate-merge-form.tsx`, `moderation-queue.tsx`, `ingredient-purchase-links-manager.tsx` |
| **inventory/** | `catalog-ingredient-form.tsx` (~51KB), `custom-ingredient-form.tsx`, `inventory-item-details-editor.tsx` (~47KB), `inventory-list-item.tsx`, `add-ingredient-modal.tsx`, `inventory-quantity-editor.tsx`, `inventory-price-input.tsx`, `inventory-toolbar.tsx`, `grouped-inventory-list.tsx` |
| **recipes/** | **`recipe-designer.tsx` (~257KB, ~6323 строки) — главный редактор и архитектурный блокер.** Также `recipe-editor-page.tsx`, `recipe-ingredients-editor.tsx`, `recipe-ingredient-row.tsx`, `recipe-stats-summary.tsx`, `public-recipe-page.tsx`, `recipe-water-additives-section.tsx`, `stock-coverage-summary.tsx`, `bitterness-settings-drawer.tsx`, `clone-recipe-button.tsx`, `import-export-modal.tsx` (BeerXML/JSON) |
| **content/** | `bjcp-catalog.tsx` (~32KB), `bjcp-style-card.tsx`, `bjcp-article-page.tsx`, `rich-text-editor.tsx` (Tiptap), `article-card.tsx`, `bjcp-filter-sheet.tsx` |
| **equipment/**, **calculators/** | Конфигурация оборудования, страницы калькуляторов |

---

## 11. Тесты (`apps/web/tests/`, ~52 файла, Vitest)

| Домен | Покрытие |
|-------|----------|
| Ingredients (~14) | Service, search, ranking, taxonomy, technical fields, normalization, picker, admin/custom форма, moderation, family backfill, purchase links |
| Inventory (~10) | Service, CRUD, фильтры, price/cost, units, suggestions API, inline actions |
| Recipes (~14) | Service, editor actions/components, stats, format/interop, publication, water/equipment flows, pages wiring |
| Прочее (~14) | Currency rates, BJCP stats, calculators, country flags, money display, smoke, site shell, public recipes |

**Пробелы:** API-роуты в основном не покрыты (OTP/magic/password/OAuth/image upload); пакеты `@nb/auth`/`@nb/ui`/`@nb/shared`/`@nb/search` — 0 тестов; нет e2e (Playwright/Cypress); `recipe-designer.tsx` тестируется только статическим рендером.

---

## 12. Состояние по стадиям

| Стадия | Статус |
|--------|--------|
| 0 — Foundation (монорепо, БД, миграции, Docker, Sentry/PostHog skeleton) | ✅ |
| 1 — Auth/Access (session, RBAC, password/OTP/magic/OAuth, ownership, profile) | ✅ |
| 2 — Brewing Core (OG/FG/ABV/IBU/color/scaling/priming, units, style ranges, brew-steps) | ✅ |
| 3 — Ingredient Catalog V2 (aliases/sources/variants/тех.поля, search+ranking, picker, admin, модерация, merge, custom) | ✅ |
| 4 — Inventory (CRUD + нормализация, фильтры/сортировка, inline edit, archive, suggestions, cost/currency, freshness) | ✅ |
| 5 — Recipes (CRUD, версионирование, cloning, drafts, author/public views, stats, publication gating, BeerXML/JSON import-export, water/equipment meta) | ✅ |
| 6 — Match Engine (рецепт vs склад) | ⚠️ только groundwork (source linkage + нормализация, нет матчинга/percent/missing UI) |
| 7 — Brew Session (исполнение варки) | ❌ только brew-steps генератор в @nb/brewing-core; нет UI/истории/списания склада |
| 8 — Content/SEO (home, BJCP, style pages, featured, sitemap, content roles, Tiptap lab) | ⚠️ частично; нет generic article CMS |

**Следующий логичный шаг:** Stage 6 — Match Engine как реальная фича (exact-match → missing list → percent match → блоки на страницах рецептов), затем family-compatible/substitutions или Stage 7.

---

## 13. Известные проблемы (из docs/improvement-recommendations.md, 2026-06-23)

**P1 — критичные:**
1. Токены логируются в `console.info` (`lib/auth.ts`) — риск account takeover
2. Captcha — заглушка (всегда true), auth-эндпоинты не защищены от ботов
3. Magic-link токен в GET-параметрах (попадает в history/proxy/Referer)
4. N+1 запросы в recipe/inventory сервисах
5. `recipe-designer.tsx` — 6323 строки, ~39 useState, логика в компоненте → нетестируемо
6. API-роуты и пакеты (`@nb/auth`/`@nb/ui`/`@nb/shared`) — 0 тестов

**P2 — важные:** нет проверок в CI (npm ci, migration drift, coverage); ~60 `@ts-ignore` и ~83 `any`; нет FK-индексов на created_by/submitted_by; "load all → filter in memory" в поиске; дублирование error/Zod-обработки; layer leakage (features импортят из components); `cleanupExpiredVerifications` определён, но не вызывается.

**P3 — желательные:** нет Prettier/pre-commit/ESLint-complexity; `@nb/search` — мёртвый scaffold; нет i18n (строки захардкожены на русском); a11y-пробелы; устаревшие зависимости.

---

## 14. Локальный запуск

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

## 15. Ключевые файлы

| Путь | Назначение |
|------|-----------|
| `CONTEXT.md` | Полная архитектура + инварианты (читать первым) |
| `CLAUDE.md` | Краткая памятка для агентов |
| `docs/improvement-recommendations.md` | Аудит P1–P3 |
| `apps/web/lib/auth.ts` | Auth gating + dev login |
| `apps/web/components/recipes/recipe-designer.tsx` | Крупнейший компонент (архит. блокер) |
| `apps/web/features/ingredients/service.ts` | Каталог CRUD, search |
| `apps/web/features/inventory/service.ts` | Сервис склада |
| `apps/web/features/recipes/service.ts` | Рецепты CRUD, версионирование |
| `packages/db/src/schema.ts` | Вся DB-схема |
| `packages/brewing-core/src/` | Расчёты, style fit |
| `packages/content/src/` | BJCP/контент |
