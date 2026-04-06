# CONTEXT.md

Файл синхронизирован с текущим состоянием репозитория по коду на 2026-04-06.
Это уже не только беклог, но и описание фактической архитектуры, от которой нужно отталкиваться.

## 1. Что это за проект

Это web-first платформа для домашних пивоваров.

Проект по-прежнему строится вокруг практического workflow, а не вокруг форума или магазина:

**Каталог ингредиентов / Мой каталог → Мой склад → Рецепты → Public recipes → BJCP / контент**

Главная продуктовая ценность:
- вести свои ингредиенты и свои пользовательские карточки ингредиентов,
- хранить склад с нормализованными единицами,
- собирать рецепты из структурированных ингредиентов,
- публиковать рецепты,
- развивать публичный BJCP / knowledge-base слой поверх доменного ядра.

Это не forum-first и не store-first продукт.

---

## 2. Главная цель текущей разработки

Проект уже вышел за рамки “только foundation”.

Текущая цель:
- удерживать проект как **modular monolith**,
- не плодить вторую архитектуру рядом с уже существующей,
- закрепить фактический source of truth для catalog / inventory / recipes / public content,
- следующую крупную продуктовую фазу строить как **реальный Match Engine**, а не как новый параллельный слой.

Отдельная практическая цель этого файла:
- убрать расхождение между старым планом и реальным кодом,
- зафиксировать, что уже сделано,
- зафиксировать, что сделано сверх старого плана,
- зафиксировать, что еще действительно не реализовано.

---

## 3. Архитектурная модель

Проект развивается как **modular monolith**.

### Основные принципы
- один основной runtime: `apps/web`
- одна база данных PostgreSQL
- один репозиторий / monorepo
- feature/service-oriented структура
- общая доменная логика в reusable пакетах и feature services
- никакой лишней микросервисности

### Реальные модули, на которые уже опирается runtime
- `apps/web` — основной Next.js runtime
- `packages/db` — схема БД, миграции, seed/reset/scripts
- `packages/auth` — auth/session/password/OAuth foundation
- `packages/brewing-core` — расчеты, style fit, brew-steps foundation
- `packages/content` — BJCP/content data layer
- `packages/ui` — shared UI primitives
- `packages/shared` — shared contracts/utils
- `packages/search` — пока **scaffold**, не основной search runtime

### Что сейчас считать source of truth
- DB schema/model layer в `packages/db/src/schema.ts`
- service layer в `apps/web/features/*`
- contracts в `apps/web/features/*/contracts.ts`
- reusable domain packages: `@nb/auth`, `@nb/brewing-core`, `@nb/content`
- shared ingredient search/picker foundation:
  - `apps/web/features/ingredients/service.ts`
  - `apps/web/features/ingredients/catalog-service.ts`
  - `apps/web/features/ingredients/picker-quick-start.ts`
  - `apps/web/components/ingredients/ingredient-picker.tsx`
  - `apps/web/app/api/ingredients/picker-quick-start/route.ts`

### Важный текущий архитектурный нюанс
- фактический runtime-каталог сейчас живет в основном на `ingredients` + `ingredient_aliases` + `ingredient_sources` + `ingredient_package_variants`
- таблица `ingredient_catalog_items` и связанный с ней старый слой остаются в схеме как исторический / совместимый слой, но **не являются основным app-level read/write path**
- пакет `@nb/search` подключен, но логика реального ingredient search сейчас живет не там, а в `apps/web/features/ingredients/*`

### Что нельзя делать
- писать ad-hoc DB queries прямо в page layer, если уже есть service
- дублировать business logic в UI
- дублировать normalization logic в клиенте
- делать второй независимый ingredient picker или второй search flow
- строить новые фичи на `@nb/search` scaffold, если задача не про развитие самого пакета
- строить новый “catalog v3” рядом с текущим working catalog runtime

---

## 4. Ключевые доменные сущности

### Catalog runtime
- `ingredients`
- `ingredient_aliases`
- `ingredient_sources`
- `ingredient_package_variants`
- `proposed_ingredients`

### User-owned ingredient layer
- `user_custom_ingredients`
- user catalog DTO / view layer через `catalog-service`

### Inventory
- `user_ingredients`

### Recipes
- `recipes`
- `recipe_ingredients`
- `recipeFamilyId` + `versionNumber` как basis для versioning

### Supporting/system entities
- `system_currency_rates`
- auth/session tables

Старые термины из раннего контекста вроде `IngredientCatalogItem` по смыслу все еще полезны, но в реальном runtime им уже не всегда соответствует одноименная working-модель.

---

## 5. Главные архитектурные инварианты

## 5.1 Ingredient identity
Ингредиенты должны быть **сущностями**, а не free-text строками.

Правильный linkage:
- catalog ingredient entity
- или user custom ingredient entity

Для inventory и recipes нельзя использовать свободный текст как primary identity, если уже есть source linkage.

---

## 5.2 Shared ingredient picker и shared search foundation
Если нужен поиск/выбор ингредиента, использовать существующую shared foundation:
- `IngredientPicker`
- `searchUserCatalogIngredients`
- `listIngredientPickerQuickStart`
- `getIngredientSuggestionByRef`
- `/api/ingredients/search`
- `/api/ingredients/picker-quick-start`

Это включает и zero-query/preset behavior:
- malt quick-start
- manufacturer/group refinements
- favorites/custom scopes
- recent selections hydration

Нельзя:
- делать отдельный picker для recipes
- делать отдельный picker для inventory
- делать отдельный search flow для catalog detail / create flows
- делать отдельный zero-query ingredient chooser рядом с existing quick-start

---

## 5.3 Entered vs normalized units
Для inventory и recipes сохраняются:
- введенное пользователем значение (`entered`)
- каноническое нормализованное значение (`normalized`)

Normalization должна происходить серверно через reusable helpers/service/domain layer.

Нельзя переносить источник истины по normalization на клиент.

---

## 5.4 Ownership and permissions
Ownership и роли проверяются серверно.

Примеры:
- пользователь не может редактировать чужой inventory
- пользователь не может редактировать чужие custom ingredients
- пользователь не может редактировать чужой private recipe
- admin/content access не должен зависеть только от скрытых кнопок в UI

---

## 5.5 Domain logic location
Calculations, normalization, access rules, publication gating, merge logic и доменные проверки живут в:
- service layer
- domain helpers
- reusable contracts/packages

А не в page components.

---

## 5.6 Current catalog runtime
Если работа идет с catalog / ingredients, основной runtime сегодня — это:
- `features/ingredients/service.ts`
- `features/ingredients/catalog-service.ts`
- `features/ingredients/presentation.ts`
- `features/ingredients/technical-fields.ts`

Не строить новые фичи так, как будто главным working source of truth является `ingredient_catalog_items`, если задача не про целевую миграцию / cleanup.

---

## 5.7 Public recipe layer
Public recipe access должен идти через recipe service:
- `getPublicRecipeBySlug`
- `getPublicRecipeById`
- `listPublicRecipes`

Slug, visibility и publication gating должны проверяться серверно.

---

## 5.8 Content / BJCP layer
BJCP/content слой сейчас file-backed через `@nb/content`.

Это значит:
- BJCP данные не живут в article CMS в БД
- Tiptap editor сейчас foundation/lab, а не основной persistence layer
- для BJCP/public content нельзя дублировать ad-hoc file parsing в page layer, если уже есть `@nb/content`

---

## 6. Текущее состояние проекта

Ниже — обновленная карта этапов и их реальный статус.

---

## Stage 0 — Foundation / Infra
### Статус: завершено

Уже есть:
- monorepo / workspace setup
- основной app runtime
- DB layer
- migrations
- env/config foundation
- base UI/system layer
- build/test/typecheck path
- Docker Compose для локальной infra
- seed/reset/dev QA scripts
- Sentry / PostHog / storage skeleton
- sitemap foundation

---

## Stage 1 — Auth / Access
### Статус: завершено и расширено

Уже есть:
- auth foundation
- `requireUser` / `requireRole` / `getSessionUser`
- roles / access model (`user`, `editor`, `moderator`, `admin`)
- protected app/admin/content routes
- ownership-safe patterns
- cookie sessions
- password auth
- OTP sign-in
- magic link sign-in
- password reset flow
- OAuth providers: Google / VK / Yandex
- profile/settings update flow

---

## Stage 2 — Brewing Core
### Статус: завершено и расширено

Уже есть:
- reusable brewing calculations
- units/conversions foundation
- OG / FG / ABV / IBU / color / scaling / priming / hydrometer helpers
- ingredient schemas/types
- style ranges + style-fit foundation
- basis for recipe stats
- brew-steps schemas/generator foundation

Это уже больше, чем изначальное “только recipe stats helpers”.

---

## Stage 3 — Ingredient Catalog Foundation / Catalog V2
### Статус: завершено и сильно расширено

Уже есть:
- рабочий catalog runtime на `ingredients`
- aliases
- sources
- package variants
- technical fields для malt / hop / yeast / consumable / water treatment
- display modes / localized labels / country/brand presentation
- search + ranking + fuzzy-ish query handling
- transliteration / keyboard layout swap / alias-aware search
- shared `IngredientPicker`
- shared zero-query malt quick-start (`brand/family/recent`)
- admin ingredient management
- moderation queue
- proposed ingredient flow
- duplicate merge flow
- usage-aware merge with inventory/recipe relinking
- catalog list/detail pages
- пользовательский каталог `/app/catalog`
- own custom ingredient cards с derivation from catalog item

Важное расхождение со старым `CONTEXT.md`:
- runtime уже ушел от старой простой модели `IngredientCatalogItem`
- working source today — richer catalog stack на `ingredients`-таблицах и `catalog-service`

Что еще не доведено до конца:
- family/match-policy groundwork в runtime пока почти не используется как продуктовая фича
- старый/новый catalog layers не сведены в одну окончательную официальную модель на уровне документации и cleanup

---

## Stage 4 — Inventory / My Ingredients
### Статус: завершено и расширено

Уже есть:

### 4A — Inventory foundation
- `user_custom_ingredients`
- `user_ingredients`
- inventory service layer
- ownership-safe CRUD
- server-side normalization

### 4B — Inventory read/add flows
- `/app/ingredients`
- summary
- grouped list
- empty/loading/error states
- add CTA
- add-from-catalog flow
- custom ingredient flow
- shared picker
- shared picker quick-start in add/edit malt contexts
- modal add flow

### 4C — Inventory usability
- search
- category/subtype filters
- show/hide empty items
- sort by name / quantity / updated / best before / price
- inline quantity editing
- detailed inline item editing
- archive/delete/set-zero actions
- validation / revalidation
- suggestions API

### 4D — Inventory cost and freshness foundation
- purchase price input
- preferred currency
- admin currency rates
- normalized RUB unit cost foundation
- purchase quantity normalization
- freshness date editing
- expiry / best-before indicators in UI

Что еще реально НЕ сделано в inventory:
- low stock thresholds / low stock alerts
- advanced bulk actions
- recipe-vs-inventory match blocks
- automatic inventory deduction from brew execution

---

## Stage 5 — Recipes

### 5A — Recipe Core Foundation
#### Статус: завершено и расширено

Уже есть:
- `recipes`
- `recipe_ingredients`
- recipe service layer
- recipe status / visibility model
- DTO/contracts
- entered + normalized model for recipe quantities
- stats integration via `@nb/brewing-core`
- slug foundation
- process meta foundation (mash / fermentation)
- recipe family/version model

### 5B — Author-side recipes
#### Статус: завершено и расширено

Уже есть:
- `/app/recipes`
- `/app/recipes/[id]`
- `/app/recipes/new`
- `/app/recipes/[id]/edit`
- my recipes list
- author-side read view
- recipe editor/designer
- ingredients editor section
- stats preview
- create/update flow
- ownership-safe editing
- draft preview
- clone recipe
- create new recipe version
- create custom ingredient from recipe editor

### 5C — Public Recipes foundation
#### Статус: завершено

Уже есть:
- slug-based public URLs
- `/recipes/[slug]`
- public listing `/recipes`
- internal public links by slug
- safe legacy redirect `/recipes/id/[id] -> /recipes/[slug]`
- server-side publication gating
- public metadata/not-found handling

Что пока еще lightweight:
- hero image/storage UX — только foundation, без полноценного media workflow
- public discovery/social/community layer — минимальный read-only listing, без более богатого community surface

---

## Stage 6 — Match Engine
### Статус: groundwork only, продуктовая фича еще не начата

Что уже подготовлено:
- source linkage в inventory и recipes
- normalized quantities/units
- category/subtype taxonomy
- family/match-policy hooks в schema/contracts
- catalog/inventory/recipe models, которые можно использовать для matching

Что еще НЕ сделано:
- recipe vs inventory matching
- percent match
- missing ingredients
- substitution / family-compatible logic в runtime
- match blocks на recipe pages/cards

---

## Stage 7 — Brew Session
### Статус: не начато в app runtime

Что уже есть только как foundation:
- `@nb/brewing-core` brew-steps generator/schemas

Что еще НЕ сделано:
- brew session DB model
- guided steps/timers/confirmations
- execution UI
- brew history tied to recipes
- inventory deduction после brew session

---

## Stage 8 — Content / SEO / Acquisition
### Статус: частично реализовано

Уже есть:
- public home page
- отдельный public BJCP section `/bjcp`
- BJCP style pages `/bjcp/[slug]`
- featured content on home
- sitemap + SEO metadata
- related BJCP materials
- category/family navigation for BJCP
- content role permissions (`editor` / `moderator` / `admin`)
- admin content area
- Tiptap editor lab / foundation

Что важно понимать:
- полноценного generic article CMS в БД пока нет
- `/articles/*` сейчас legacy redirect layer на BJCP
- calculators пока не сделаны
- broader SEO/acquisition layer пока не доведен до полноценного самостоятельного блока

---

## 6.1 Что сделано сверх старого CONTEXT.md

Ниже — вещи, которых старая версия файла почти не отражала, но которые уже реально есть в проекте:

- отдельный пользовательский catalog workspace `/app/catalog`
- richer catalog runtime с aliases / sources / package variants / display modes / technical fields
- money/currency layer и inventory purchase cost foundation
- recipe versioning / clone / draft preview / process meta
- public recipes по slug уже завершены
- полноценный BJCP public section с sitemap/metadata
- featured content on home
- content-role model для editor/moderator/admin
- Tiptap editor lab
- brewing-core style fit и brew-steps foundation

---

## 7. Что уже считается реализованным и на что нужно опираться

Если работаешь над catalog / ingredients:
- используй `features/ingredients/service.ts`
- используй `features/ingredients/catalog-service.ts`
- используй existing `IngredientPicker`
- если нужен zero-query/preset flow, расширяй existing picker quick-start, а не строй новый
- используй existing normalization / presentation / technical-fields helpers
- не делай новый search flow рядом с existing one
- не считай `@nb/search` основным runtime search module

Если работаешь над inventory:
- используй existing inventory service layer
- используй existing unit normalization model
- используй shared picker/search
- используй `purchase-cost` и `system/currency-rates`, если задача касается цены
- не дублируй ownership checks

Если работаешь над recipes:
- используй existing recipe service layer
- используй `recipes` / `recipe_ingredients` contracts
- используй existing normalization model
- используй `@nb/brewing-core` for stats/style fit
- respect slug/version/publication logic server-side
- не делай новый recipe domain в UI

Если работаешь над public recipe layer:
- используй `getPublicRecipeBySlug` / `listPublicRecipes`
- respect status/visibility rules server-side
- не делай ad-hoc page queries

Если работаешь над BJCP/content:
- используй `@nb/content`
- помни, что current content layer file-backed
- не строй новый article persistence layer “по-тихому” в page/components

---

## 8. Текущий следующий логический шаг

Следующий большой продуктовый шаг по проекту:

### Реализовать Stage 6 — Match Engine как реальную working-фичу

Логичная MVP-последовательность:
- exact match recipe ingredients vs inventory by source linkage
- missing ingredients list
- percent match
- базовые match blocks на recipe pages/cards

После этого:
- либо углублять family-compatible matching и substitutions
- либо идти в Stage 7 — Brew Session

Параллельный технический housekeeping, который тоже полезно держать в уме:
- окончательно закрепить catalog runtime на уровне документации и cleanup
- не продолжать расти сразу на двух моделях каталога

---

## 9. Правила для AI coding agent

Перед изменениями:

1. Сначала прочитай этот файл.
2. Потом посмотри, что реально есть в репозитории.
3. Если этот файл и код конфликтуют, код важнее; документ либо синхронизируй, либо явно отмечай расхождение.
4. Используй существующие сервисы, модели, DTO и shared components.
5. Не строй новые фичи поверх `@nb/search` scaffold, если задача не про сам пакет.
6. Не строй новые catalog flows как будто `ingredient_catalog_items` — главный working runtime, если задача не про миграцию/cleanup.
7. В отчете всегда указывай:
   - что уже нашел в репозитории
   - на какие существующие сущности/сервисы опираешься
   - что добавил
   - что оставил на следующий пакет

---

## 10. Что считать хорошим результатом задачи

Хороший результат — это:
- минимальное расширение existing architecture
- reuse existing services/contracts/components
- сохранение domain invariants
- focused tests
- no parallel architecture

Плохой результат — это:
- новый второй service layer рядом со старым
- новый второй picker/search flow
- normalization на клиенте
- ad-hoc DB queries прямо в route/page
- free-text ingredient model там, где уже есть entity linkage
- рост еще одной “версии” каталога рядом с текущим runtime

---

## 11. Что важно помнить про protected routes и QA

Многие маршруты проекта защищены auth/access.

Поэтому:
- screenshot protected route без реальной session почти бесполезен
- Playwright без seeded/authenticated flow не является сильным сигналом качества
- для protected areas основной критерий:
  - service tests
  - action tests
  - component tests
  - page wiring tests
  - typecheck

В репозитории уже есть заметное покрытие для:
- ingredients
- inventory
- recipes
- money/currency
- BJCP presentation helpers

Manual QA полезен только если он идет через:
- реальный seeded user
- реальную auth session
- реальную роль

---

## 12. Короткое резюме для агента

Этот проект уже строится вокруг:
- структурированного ingredient catalog runtime,
- user custom ingredients,
- user inventory,
- recipe domain с public layer,
- BJCP/content public layer,
- future match engine,
- future brew execution.

Главные инварианты:
- ingredient entity, not free-text
- shared picker/search foundation
- entered + normalized units
- server-side business logic
- ownership-safe services
- reuse current catalog/inventory/recipe/content services instead of building new layers

Если сомневаешься — выбирай:
- меньший change set
- reuse existing code
- server-side truth
- domain consistency over local convenience
