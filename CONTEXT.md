# CONTEXT.md

## 1. Что это за проект

Это web-first платформа для домашних пивоваров.

Главная продуктовая связка:

**Мои ингредиенты → Рецепты → Match → Варка → История**

Это не forum-first и не store-first продукт.  
Основная ценность — практический workflow домашнего пивовара:
- вести свои ингредиенты,
- создавать и хранить рецепты,
- сопоставлять рецепты с запасами,
- затем запускать варку по рецепту.

---

## 2. Главная цель текущей разработки

Сейчас проект строится поэтапно как **modular monolith**.

Цель — сначала создать **надежное доменное ядро**:
- ингредиенты,
- инвентарь,
- рецепты,
- единицы измерения,
- доступы и ownership,

и только потом на этом строить:
- public layer,
- match engine,
- brew session,
- SEO/content слой.

---

## 3. Архитектурная модель

Проект должен развиваться как **modular monolith**.

### Основные принципы
- один основной runtime
- одна база данных
- один репозиторий
- feature/service-oriented структура
- общая доменная логика в reusable слоях
- никакой лишней микросервисности

### Что считать source of truth
- DB schema/model layer
- service layer
- DTO/contracts
- shared UI/components
- existing auth/access pattern
- existing normalization/unit model

### Что нельзя делать
- писать ad-hoc DB queries прямо в page layer, если уже есть service
- дублировать business logic в UI
- дублировать normalization logic в клиенте
- делать параллельные ingredient / recipe / inventory модели
- делать второй независимый ingredient picker или второй search flow

---

## 4. Ключевые доменные сущности

### Ingredient catalog
- `IngredientCatalogItem`
- `ProposedIngredient`

### User inventory
- `UserCustomIngredient`
- `UserIngredient`

### Recipes
- `Recipe`
- `RecipeIngredient`

Эти сущности должны использоваться повторно в следующих модулях.
Не создавать параллельные модели без крайней необходимости.

---

## 5. Главные архитектурные инварианты

## 5.1 Ingredient identity
Ингредиенты должны быть **сущностями**, а не free-text строками.

Правильный source linkage:
- catalog ingredient entity
- или user custom ingredient entity

Нельзя использовать свободный текст как primary ingredient identity там, где уже есть структурированная модель.

---

## 5.2 Shared ingredient picker
Если в проекте уже существует `IngredientPicker` / shared ingredient search foundation, его нужно переиспользовать.

Нельзя:
- делать отдельный picker для recipes
- делать отдельный picker для inventory
- делать отдельный picker для admin, если можно использовать shared foundation

---

## 5.3 Entered vs normalized units
Для inventory и recipes обязательно сохранять:

- то, что ввел пользователь (`entered`)
- и каноническое нормализованное значение (`normalized`)

Примеры:
- entered: `1 kg`
- normalized: `1000 g`

Для объема:
- entered: `2 l`
- normalized: `2000 ml`

Клиент не должен быть источником истины для normalization.
Normalization должна происходить серверно через reusable helpers/service/domain layer.

---

## 5.4 Ownership and permissions
Ownership и роли должны проверяться серверно.

Примеры:
- пользователь не может редактировать чужой inventory
- пользователь не может редактировать чужой private recipe
- admin/moderator access не должен зависеть только от скрытых кнопок в UI

---

## 5.5 Domain logic location
Calculations, normalization, access rules и доменные проверки должны жить в:
- service layer
- domain helpers
- reusable contracts

А не в page components.

---

## 6. Текущее состояние проекта

Ниже — карта этапов и текущий статус.

---

## Stage 0 — Foundation / Infra
### Статус: завершено

Ожидается, что в репозитории уже есть:
- monorepo / workspace setup
- app runtime
- DB layer
- migrations
- env/config foundation
- base UI/system layer
- build/test/typecheck path

---

## Stage 1 — Auth / Access
### Статус: завершено

Ожидается:
- auth foundation
- `requireUser` / equivalent auth guard
- roles / access model
- protected app/admin routes
- ownership-safe patterns

---

## Stage 2 — Brewing Core
### Статус: завершено

Ожидается:
- reusable brewing calculations
- units/conversions foundation
- stats helpers
- basis for recipe stats and future brew logic

---

## Stage 3 — Ingredient Catalog Foundation
### Статус: завершено

Ожидается:
- `IngredientCatalogItem`
- `ProposedIngredient`
- search + fuzzy search
- shared `IngredientPicker`
- admin ingredient management
- moderation queue
- duplicate merge flow

---

## Stage 4 — Inventory / My Ingredients
### Статус: реализовано основное ядро

Ожидается, что уже существуют:

### 4A — Inventory foundation
- `UserCustomIngredient`
- `UserIngredient`
- inventory service layer
- ownership-safe CRUD

### 4B.1 — My Ingredients read layer
- `/app/ingredients`
- summary
- grouped list
- empty/loading/error states

### 4B.2 — Add ingredient UX
- add CTA
- add-from-catalog flow
- custom ingredient flow
- type selector
- modal/drawer add flow

### Corrective inventory foundation
- working shared picker in add-from-catalog
- entered + normalized units foundation for inventory

### 4C-lite — Inventory usability
- search
- type filter
- archived toggle
- inline quantity editing
- inline entered unit editing
- validation / revalidation

### Что еще НЕ сделано в inventory
- low stock indicators
- freshness indicators
- recipe bridge
- advanced bulk actions

---

## Stage 5 — Recipes


### 5A — Recipe Core Foundation
#### Статус: завершено

Ожидается:
- `Recipe`
- `RecipeIngredient`
- recipe service layer
- recipe status / visibility model
- stats integration via brewing-core
- DTO/contracts
- entered + normalized model for recipe quantities

### 5B.1 — My Recipes read layer
#### Статус: завершено

Ожидается:
- `/app/recipes`
- `/app/recipes/[id]`
- my recipes list
- author-side read-only detail

### 5B.2 — Recipe Editor Foundation
#### Статус: завершено

Ожидается:
- `/app/recipes/new`
- `/app/recipes/[id]/edit`
- basic recipe form
- ingredients editor section
- stats preview
- create/update flow
- ownership-safe editing

### 5C — Public Recipes foundation
#### Статус: завершено

Уже есть:
- public recipe page foundation
- публичный read-only route recipe page
- service accessor для public recipe read
- published/public visibility gating

Но еще НЕ завершено:
- slug foundation
- slug-based public URLs
- public recipe listing
- internal public links by slug

---

## Stage 6 — Match Engine
### Статус: В разработке

Планируется:
- recipe vs inventory matching
- percent match
- missing ingredients
- future match blocks on recipe pages/cards

---

## Stage 7 — Brew Session
### Статус: не начато

Планируется:
- brew session foundation
- guided steps/timers/confirmations
- future inventory deduction

---

## Stage 8 — Content / SEO / Acquisition
### Статус: не начато как полноценный блок

Планируется:
- article/guide system
- public content pages
- calculators
- internal linking
- broader SEO/public acquisition layer

---

## 7. Что уже считается реализованным и на что нужно опираться

Если ты работаешь над inventory:
- используй existing inventory service layer
- используй existing unit normalization model
- используй shared ingredient picker/search
- не дублируй ownership checks

Если ты работаешь над recipes:
- используй existing recipe service layer
- используй `Recipe` / `RecipeIngredient`
- используй existing normalization model
- используй brewing-core for stats
- не делай новый recipe domain в UI

Если ты работаешь над public recipe layer:
- используй existing recipe service
- respect status/visibility rules server-side
- не делай ad-hoc page queries
- развивай slug + public listing foundation, а не создавай отдельный public recipe model

---

## 8. Текущий следующий логический шаг

На данный момент следующий правильный шаг по проекту:

### Завершить Stage 5C — Public Recipes foundation
То есть:
- slug foundation for recipes
- `/recipes/[slug]`
- public listing `/recipes`
- links by slug
- safe migration/backfill path

После этого логично идти в:
- **Stage 6 — Match Engine**

---

## 9. Правила для AI coding agent

Перед изменениями:

1. Сначала прочитай этот файл.
2. Потом посмотри, что реально есть в репозитории.
3. Используй существующие сервисы, модели, DTO и shared components.
4. Если чего-то из описанного здесь нет — не переписывай все, а расширяй существующую архитектуру минимально.
5. В отчете всегда указывай:
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

Manual QA полезен только если он идет через:
- реальный seeded user
- реальную auth session
- реальную роль

---

## 12. Короткое резюме для агента

Этот проект строится вокруг:
- структурированных ингредиентов,
- user inventory,
- recipe domain,
- future recipe matching,
- future brew execution.

Главные инварианты:
- ingredient entity, not free-text
- shared picker/search foundation
- entered + normalized units
- server-side business logic
- ownership-safe services
- recipe and inventory models that are future-compatible with matching

Если сомневаешься — выбирай:
- меньший change set
- reuse existing code
- server-side truth
- domain consistency over local convenience