# Инвентарь (Мой склад) — Reference

> **Назначение:** data model, сервис и страница инвентаря /app/ingredients (фильтры, normalization, цены/валюты, consume).
> **Источники истины (код):** `apps/web/features/inventory/*`, `apps/web/app/(app)/app/ingredients/*`, `packages/db/src/schema.ts` (userIngredients)
> **Обновлено:** 2026-06-25
> **См. также:** [CONTEXT.md](../../CONTEXT.md), [ingredient-add-and-search.md](ingredient-add-and-search.md), [ingredient-seed-schema.md](ingredient-seed-schema.md)

---

Склад («Мой склад») — это пользовательские остатки ингредиентов, а не общий каталог. Каждая позиция хранит ссылку на ровно один источник (системный catalog ingredient **или** пользовательский custom ingredient) плюс собственные batch/inventory-поля: количество, единица, цена, даты, заметки.

Раскладка кода после рефактора:

- `features/inventory/service.ts` — основной сервис (CRUD, list, summaries, normalization, derived custom).
- `features/inventory/contracts.ts` — zod-схемы payload и DTO.
- `features/inventory/units.ts` — единицы, профили единиц, нормализация меры.
- `features/inventory/pack.ts` — `pack`-эквиваленты (yeast).
- `features/inventory/purchase-cost.ts` — нормализация цены/валют.
- `features/inventory/display.ts` — human-facing количество и стоимость для UI.
- `features/inventory/consume.ts` — расчёт списания/пополнения (consume/restock).
- `features/inventory/custom-ingredient.ts` — technical data и профиль для custom ingredient из add-to-inventory flow.
- `features/inventory/page-model.ts` — парсинг URL, группировка, toolbar href.
- `app/(app)/app/ingredients/` — страница (`page.tsx` → Suspense, `content.tsx` → `MyIngredientsContent`), `actions.ts`, `metadata-actions.ts`.
- `components/inventory/*` — UI (карточка, тулбар, модалки, inline editor, consume control).

---

## Data model

### Таблица `user_ingredients` (`packages/db/src/schema.ts:379`)

Это таблица позиций склада. Ключевые поля:

- `id` — UUID позиции.
- `userId` — владелец, FK `users` (`on delete cascade`).
- `ingredientCatalogItemId` — `text`, FK `ingredients`, nullable (`on delete set null`).
- `userCustomIngredientId` — UUID, FK `user_custom_ingredients`, nullable (`on delete set null`).
- `packageVariantId` — FK `ingredient_package_variants`, nullable; для catalog-упаковок/consumables (`on delete set null`).
- `ingredientFamilyId`, `ingredientCategory` (enum, NOT NULL), `ingredientSubtype` (varchar) — snapshot taxonomy.
- `ingredientDisplayNameSnapshot` — snapshot имени источника на момент сохранения.
- `ingredientDefaultDisplayUnitSnapshot` — snapshot default display unit.
- `ingredientMeasurementDimension` (enum) — snapshot dimension `weight | volume | count`.
- `enteredQuantity` / `enteredUnit` — количество как ввёл пользователь (NOT NULL).
- `normalizedQuantity` / `normalizedUnit` — количество в нормализованной единице (NOT NULL).
- `unitDimension` (enum, NOT NULL) — dimension нормализованной/введённой меры.
- `priceInputMode` (enum `total | per_display_unit`), `priceInputAmountMinor` (integer), `priceInputCurrency` (enum) — то, что ввёл пользователь.
- `purchasePriceMinor`, `purchaseCurrency` — расчётная итоговая цена покупки (minor units).
- `purchaseQuantity`, `purchaseQuantityUnit`, `purchaseQuantityNormalized`, `purchaseQuantityNormalizedUnit` — количество, к которому относится цена.
- `normalizedUnitCostMinorRub` (integer) — стоимость одной normalized unit в RUB minor units.
- `properties` — `jsonb`, default `{}` (зарезервировано под доп. свойства позиции).
- `purchasedAt`, `freshnessDate`, `notes`.
- `archivedAt` — поле есть; используется `archiveInventoryItem()`, но текущая кнопка удаления делает hard delete.
- `createdAt`, `updatedAt`.

Индексы: `userId`, (`userId`,`archivedAt`), `ingredientCatalogItemId`, `userCustomIngredientId`, `packageVariantId`, `ingredientFamilyId`, `ingredientCategory`.

**XOR source — теперь на уровне БД.** В схеме есть CHECK `user_ingredients_source_linkage_chk`:

```sql
((ingredient_catalog_item_id is not null and user_custom_ingredient_id is null)
 or (ingredient_catalog_item_id is null and user_custom_ingredient_id is not null))
```

То есть ровно один из `ingredientCatalogItemId` / `userCustomIngredientId` обязателен. Сервисные zod-схемы дополнительно проверяют это (`"Exactly one source is required"`). (Это отличие от прежних доков, где утверждалось, что DB-level CHECK отсутствует.)

### DTO позиции (`mapInventoryRow()` → `InventoryListItemDto`)

Source резолвится в одном из трёх режимов:

- `catalog` — через `buildCatalogSourceDto()` / `buildCatalogIngredientLinkage()`;
- `custom` — через `buildCustomSourceDto()` / `buildCustomIngredientLinkage()`;
- fallback snapshot — если live source недоступен, берутся snapshot-поля из `user_ingredients`.

DTO содержит: ссылки на catalog/custom/package variant; snapshot taxonomy/display/unit; entered/normalized quantity; price input + расчётные purchase fields; даты/заметки/`archivedAt`; `source` (display names, brand/country, technicalData, unit profile, summary, purchase-links summary). После маппинга `applyPurchaseLinkSummariesToInventoryItems()` догружает summary по reference `sourceKind:sourceId`.

---

## Сервис и actions

Основные функции `service.ts`:

- `listInventoryForUser(userId, query)` — список позиций (см. ниже фильтры/сортировку).
- `getInventorySummaries(userId)` — агрегаты по категориям/остаткам.
- `addCatalogIngredientToInventory(userId, payload, ctx)` / `addCustomIngredientToInventory(...)` — добавление позиции.
- `resolveCatalogInventoryAdditionSource(...)` — выбор catalog vs derived-custom при technical override.
- `createUserCustomInventoryIngredient(...)` — создать custom ingredient (упрощённая схема, без обязательных technical fields).
- `updateInventoryItem(...)` — полное редактирование (может сменить linkage).
- `updateInventoryQuantity(...)` — inline-обновление только количества.
- `setInventoryItemQuantityToZero(...)` — обнулить остаток.
- `archiveInventoryItem(...)` — `archivedAt = now` (в UI не используется).
- `deleteInventoryItem(...)` — hard delete.

Server actions (`app/(app)/app/ingredients/actions.ts`):

- `addCatalogIngredientAction` — catalog позиция без override.
- `addSelectedIngredientAction` — диспетчер: при `userCustomIngredientId` → custom; при catalog id без override → `addCatalogIngredientAction`; при catalog id + override → `resolveCatalogInventoryAdditionSource` (catalog или derived-custom).
- `addCustomIngredientAction` — создать custom ingredient и добавить в склад.
- `updateInventoryItemAction` → `updateInventoryItem`.
- `updateInventoryInlineAction` → `updateInventoryQuantity` (используется и inline-редактором, и consume control).
- `setInventoryItemEmptyAction` → `setInventoryItemQuantityToZero` (существует, но текущим UI карточки не вызывается).
- `deleteInventoryItemAction` → `deleteInventoryItem`.

**Revalidate.** Add/edit-actions делают `revalidatePath("/app/ingredients")` и `revalidatePath("/catalog")` (каталог теперь публичная зона `/catalog`, а не `/app/catalog`). Inline/quantity-actions ревалидируют только `/app/ingredients`.

Покупочные ссылки (purchase links) сохраняются отдельным path: если `purchaseLinksTouched`, action нормализует URL (`normalizeIngredientPurchaseLinkInputs`) и вызывает `replaceIngredientPurchaseLinksForReference()` для `catalog`/`custom` reference. Невалидный URL → `INVALID_PURCHASE_LINK_URL` → «Проверьте ссылки на покупку…».

### Добавление позиции в сервисе (общая схема)

`addCatalogIngredientToInventory` / `addCustomIngredientToInventory`:

1. Валидируют payload (`addCatalogInventoryItemSchema` / `addCustomInventoryItemSchema`).
2. Проверяют доступность/ownership источника (активность catalog ingredient; принадлежность custom user'у; принадлежность `packageVariantId` ingredient'у для catalog).
3. Строят linkage и unit profile.
4. Нормализуют количество (`normalizeMeasurementWithPackageVariant`).
5. Нормализуют цену (`normalizeInventoryPurchaseContext`).
6. Insert в `user_ingredients`: для catalog — `ingredientCatalogItemId = id`, `userCustomIngredientId = null`, `packageVariantId = variant.id | null`; для custom — наоборот, `packageVariantId` всегда `null`. В обоих случаях пишутся snapshot taxonomy/display/unit/dimension, entered/normalized quantity, price fields, даты/заметки.

### Derived custom при catalog override

`resolveCatalogInventoryAdditionSource()`:

- читает catalog ingredient, сравнивает override с текущими technical data;
- если override фактически не меняет значения → возвращает catalog source (позиция останется catalog);
- если меняет → создаёт/переиспользует derived custom ingredient (`derivedFromIngredientId`, `derivedFromDisplayName`) и возвращает custom source.

Поддерживаемые override: fermentable/malt — `fermentableColorEbc`, `fermentableExtractYieldPct`; hop — `hopAlphaAcidPct`. Имя derived custom строится из display name + дескриптора (`N EBC / N%` для fermentable, `N% AA` для hop); при конфликте имени пробуются суффиксы `2`, `3` (иначе `DERIVED_CUSTOM_NAME_CONFLICT`). Системный каталог при этом не мутируется. В склад попадает custom linkage, пользователь видит «Свой вариант ингредиента добавлен в запасы.».

### Custom ingredient из add-to-inventory flow

`createUserCustomInventoryIngredient` использует `createUserCustomInventoryIngredientSchema`, которая **не требует** technical fields. Поэтому custom ingredient можно создать без цвета/экстрактивности/AA/аттенюации — в отличие от полной catalog-form схемы. Technical data собирается `buildCustomIngredientTechnicalData()` (`custom-ingredient.ts`); для dry yeast автоматически проставляются `packageSize = 11`, `packageUnit = "g"`.

---

## Normalization (entered + normalized)

Единицы (`units.ts`):

- weight: `g`, `kg`, `oz`, `lb` (нормализуются в `g`);
- volume: `ml`, `l`, `gal` (нормализуются в `ml`);
- count: `item`, `pack` (остаются в count unit).

`resolveInventoryUnitProfile()` строит профиль по приоритету:

1. `quantityDefaults` из catalog ingredient, если есть;
2. practical yeast profile: dry yeast → default `pack` (allowed `pack`, `g`, dimension `count`); liquid/slurry/culture → default `ml`, если explicit default не задан;
3. explicit `defaultDisplayUnit` / `allowedUnits` / `measurementDimension`;
4. fallback taxonomy `resolveIngredientUnits()`;
5. иначе — default `g`, weight units.

`resolveHumanFacingInventoryUnitProfile()` переопределяет default ради удобства UI: fermentable → `kg`, hop → `g`, water_treatment acid → `ml` (иначе `g`), yeast → `pack` (если разрешён); consumable профиль не трогает.

`normalizeInventoryMeasurementForProfile()`: парсит unit, проверяет, что он разрешён профилем (`INVALID_UNIT` / `INCOMPATIBLE_UNIT`), округляет entered quantity до 3 знаков, конвертирует weight→`g`, volume→`ml`, count оставляет.

### `pack` (`pack.ts` + `normalizeMeasurementWithPackageVariant`)

- Если выбран catalog `packageVariant` с `stockContentAmount/stockContentUnit` и entered unit `pack`: `normalizedQuantity = enteredQuantity * stockContentAmount`, `normalizedUnit = stockContentUnit`.
- Если entered unit `pack` и есть yeast pack-эквивалент: используется `resolveInventoryPackEquivalent()`.
- Иначе — обычная нормализация по профилю.

`resolveInventoryPackEquivalent()` работает **только для yeast**: если в technical data есть `packageSize/packageUnit`, конвертирует в `g`/`ml`; для dry yeast без размера — fallback `1 pack = 11 g`; для остальных типов — `null`.

### Хранимое отображаемое количество

В UI показывается не сырой `enteredQuantity`, а результат `resolveInventoryMeasurementForDisplay()` (`display.ts`): нормализованное количество конвертируется в human display unit профиля. Если конвертация невозможна — fallback к `enteredQuantity/enteredUnit`. `formatInventoryQuantityForDisplay()` для `pack` дополнительно показывает эквивалент в скобках (например `2 пачки (22 г)`).

---

## Цены/валюты

Цена вводится через `InventoryPriceInput`. Режимы (`priceInputMode`): `total` (сумма за весь введённый stock) и `per_display_unit` (цена за human display unit). Суммы — в минорных единицах валюты (integer).

`resolveInventoryPriceComputation()` / `normalizeInventoryPurchaseContext()` (`purchase-cost.ts`):

1. `priceInputAmountMinor` = `input.priceInputAmountMinor ?? input.purchasePriceMinor` (legacy). Если нет — все price fields `null`.
2. `priceInputMode` по умолчанию `total`.
3. `priceInputCurrency` по умолчанию: `priceInputCurrency → purchaseCurrency → options.defaultCurrency (preferred) → "RUB"`.
4. `total` → `purchasePriceMinor = priceInputAmountMinor`. `per_display_unit` → `purchasePriceMinor = round(priceInputAmountMinor * displayQuantity)` (если `displayQuantity > 0`, иначе `null`). Симметрично считается `perDisplayUnitPriceMinor`.
5. `purchaseQuantity` по умолчанию = fallback measurement (то количество, что добавляется в склад), нормализуется тем же профилем. Если задано количество без юнита → `INVALID_PURCHASE_UNIT`.
6. `normalizedUnitCostMinorRub = round(convertCurrencyMinorToRubMinor(purchasePriceMinor, currency, rates) / purchaseQuantityNormalized)`.

В БД хранятся и input (`priceInput*`), и расчётный total/cost (`purchase*`, `normalizedUnitCostMinorRub`).

Отображение `buildInventoryCostDisplay()` (`display.ts`):

- total price конвертируется из `purchaseCurrency` в preferred currency пользователя;
- unit price берётся из `normalizedUnitCostMinorRub` (нормализованная стоимость в RUB minor), пересчитывается в цену за human display unit (`resolveDisplayUnitCostMinor`) и переводится в preferred currency.

---

## Страница /app/ingredients

`page.tsx` оборачивает `MyIngredientsContent` (из `content.tsx`) в `Suspense` со скелетоном. `MyIngredientsContent` требует `requireUser()`.

### Чтение URL

- `search` — поиск по складу;
- `category` — `fermentable | hop | yeast | water_treatment | consumable`;
- `type` — legacy, конвертируется в category (а `type=malt` → `subtype=malt`);
- `subtype` — `malt | fermentable` (для fermentables);
- `group` — quick-start group;
- `finished=true` (+ legacy `stock=all|empty`) — показывать закончившиеся;
- `sort` — `default | name | quantity | updated | best_before | price`;
- `addSource=catalog|custom` + `addId` — открыть add modal сразу с выбранным ингредиентом (deep-link из каталога).

Параллельно грузятся: `listInventoryForUser`, `getInventorySummaries`, `listSystemCurrencyRates`, и (если есть `addSource/addId`) `getIngredientSuggestionByRef`. Если запрошен `finished=true`, но `summary.emptyItems === 0`, идёт redirect на тот же URL без `finished`.

Хедер: заголовок **«Мой склад»**, summary `N в наличии · M закончились` (если есть позиции), кнопка `Добавить ингредиент` (открывает modal, не отдельный route).

### Фильтры и поиск (`InventoryToolbar`)

Toolbar управляет URL через `router.replace(..., { scroll: false })`. Tile-фильтры: `Солод`, `Сбраживаемое сырьё`, `Хмель`, `Дрожжи`, `Водоподготовка`, `Расходники`. `Солод` и `Сбраживаемое сырьё` — это одна доменная category `fermentable`, различаются `subtype = malt | fermentable`. Toggle закончившихся появляется только при `emptyItems > 0`. На tile показывается count (без finished — только in-stock; с finished — с учётом пустых; `0` без активного фильтра → disabled + «Пусто»). Кнопка `Сбросить` видна при активных фильтрах и возвращает всё к дефолту.

Поиск: debounce `250ms`, фильтр в `listInventoryForUser` по `ILIKE` по `coalesce(ingredientDisplayNameSnapshot, ingredients.nameRu, ingredients.nameEn, userCustomIngredients.displayName)`. Page-level фильтр не требует минимума символов; но suggestions у picker появляются от 2 символов. Autocomplete `InventorySearchInput` → `GET /api/inventory/suggestions` → `searchInventorySuggestions()` (поверх `listInventoryForUser` с `search=q`), dedupe по `(sourceKind, sourceId, packageVariantId)`, limit 1..20 (default 10).

`listInventoryForUser` под капотом: left join `ingredients`, `user_custom_ingredients`, `ingredient_package_variants`; фильтр по `userId`, `archivedAt is null` (если archived не включён), `ingredientCategory` и поиску; после map в DTO — доп. фильтр по `type/subtype` и stock state (`in_stock` → `normalizedQuantity > 0`; `empty` → `<= 0`; `all` без `includeEmpty` → тоже только `> 0`).

### Сортировка (server-side в `listInventoryForUser`)

- `quantity` — `normalizedQuantity` desc;
- `updated` — `updatedAt` desc;
- `best_before` — `freshnessDate` asc, `null` в конец (`MAX_SAFE_INTEGER`);
- `price` — `normalizedUnitCostMinorRub` desc, без цены трактуется как `-1`;
- default/name (fallback) — `source.primaryLabelRu.localeCompare(..., "ru")`.

**`default` фактически = сортировка по названию** (попадает в fallback-ветку).

### Группировка списка (`groupInventoryItems`, `GroupedInventoryList`)

Порядок групп (`inventoryPrimaryGroupKeys`):

1. `fermentable` — «Сбраживаемое сырьё» (солод и прочее сбраживаемое объединены в одну группу; отдельной группы `malt` больше нет);
2. `hop` — «Хмель»;
3. `yeast` — «Дрожжи»;
4. `water_treatment` — «Водоподготовка»;
5. `consumable_supply` — «Расходники»;
6. `consumable_additive` — «Другие добавки».

Consumables делятся на `consumable_supply` / `consumable_additive` через `resolveConsumableInventoryBroadGroup`. Пустые группы не выводятся. Внутри группы порядок наследуется от server-side sort; отдельного «empty → в хвост» в текущем коде группировки нет (прежняя формулировка устарела). По умолчанию (`finished=false`) пустые позиции вообще скрыты фильтром.

### Карточка позиции (`InventoryListItem`)

Показывает: primary/secondary display name; ссылку с заголовка в detail page каталога (`/catalog/custom/{id}` или `/catalog/system/{id}` — каталог публичный); brand/country; technical badges по category (hop: α, форма, год; malt/fermentable: цвет EBC c цветовым акцентом, экстрактивность, max usage; yeast: форма, аттенюация, темп. диапазон; water_treatment: preferred unit, если не `g/ml`, и химформула в заголовке; consumable: форма/usage stage); badge источника (`Свой` / `Измененный` для derived custom / `Архив`); total и unit price; `purchasedAt`; `freshnessDate` с предупреждением (`expired`, если дата < now; `critical`, если < 30 дней); purchase-links trigger; заметки. Карточка приглушается при нулевом остатке и меняет цвет рамки при близком/просроченном сроке.

Кнопки действий справа сверху: «Редактировать» (иконка `MoreHorizontal`/три точки → `InventoryItemDetailsEditor`) и «Удалить» (иконка корзины → confirm dialog). В нижней правой части — inline-редактор количества + кнопка «Изменить» (consume/restock).

### Empty state и error

`InventoryEmptyState` различает случаи: склад вообще пуст («Пока нет ингредиентов» + CTA), ничего не найдено по search/категории/finished. Клиентский error boundary показывает «Не удалось загрузить "Мой склад"» + «Повторить».

### Add flow (кратко)

Точки входа: CTA в хедере, CTA в empty state, deep-link `addSource/addId`. `AddIngredientModal` хранит режим `catalog | custom`, выбранные category/subtype, выбранный ingredient. Стартовая категория: `initialSelection` → page filter → `localStorage` (`nb:add-ingredient:last-category`) → `malt`. При наличии selection grid категорий и mode-switch скрываются. Успешный submit закрывает modal и делает `router.refresh()`; последняя категория сохраняется в localStorage.

- **Catalog mode** (`CatalogIngredientForm`): shared `IngredientPicker` ищет в unified source (system + custom) через `GET /api/ingredients/search`. Для `fermentable + malt` до 2 символов показывается zero-query quick-start (`POST /api/ingredients/picker-quick-start`): бренды, типы, недавние, флаги доступности `Только избранные` / `Только свои`. Optional disclosure: цена, ссылки, даты, заметка. Batch override (цвет/экстрактивность для fermentable, AA для hop) → derived custom (см. выше).
- **Custom mode** (`CustomIngredientForm`): browser своих ингредиентов (поиск/сортировка/`Добавить новый`) → либо выбрать существующий, либо создать новый и сразу добавить. Поля create-form зависят от category. Optional disclosure тоже включает цену/ссылки/даты/заметку; для ещё не созданного ingredient purchase links ведутся как draft без reference (`allowDraftWithoutReference`) и привязываются после создания.

### Edit flow

`InventoryItemDetailsEditor` (открывается иконкой действий) инициализируется из текущей карточки: source → `IngredientSuggestionItem`, количество через `resolveInventoryMeasurementForDisplay`, цена конвертируется в preferred currency, даты как `YYYY-MM-DD`. Можно заменить ingredient (тот же picker; для malt — quick-start без `Только свои`, т.к. нет `allowCustomOnlyFilter`), сменить category/subtype, изменить количество/единицу, открыть optional (цена/даты/заметки/purchase links).

`updateInventoryItem`: требует существующую позицию user'а и ровно один source; для catalog проверяет ingredient + package variant; для custom проверяет ownership и **сбрасывает `packageVariantId = null`**; нормализует количество и цену; обновляет source fields, snapshot, quantity, price, dates, notes, `updatedAt`. Замена source может переключить позицию catalog↔custom.

Ограничения: edit flow **не** имеет UI для catalog technical override (замена на catalog сохранится как catalog без derived custom). `canSubmitInventoryForm` пропускает submit только при quantity `> 0` — через edit нельзя сохранить нулевой остаток (для этого consume «Всё» / inline `0`).

### Удаление

Иконка корзины → `ConfirmActionDialog` («Удалить ингредиент?», «…будет удалена из запасов без возможности восстановления») → `deleteInventoryItemAction` → **hard delete** строки. Закончившиеся позиции — это не архив, а `normalizedQuantity <= 0` (строка остаётся, видна при `finished=true`).

---

## Inline editing и consume

В карточке (`inventory-list-item.tsx`) теперь два независимых контрола, оба сабмитят через `updateInventoryInlineAction` → `updateInventoryQuantity`:

### Inline-редактор количества (`InventoryInlineQuantityEditor`)

Click-to-edit: остаток показан текстом (`formatInventoryQuantityForDisplay`); по клику превращается в input + select единицы. Стартовое значение — display measurement (human unit), а не сырой `enteredQuantity`. `Enter`/✓ сохраняет новый абсолютный остаток, `Esc`/✕ откатывает; blur за пределы редактора коммитит при валидном значении, иначе отменяет. Если значение пустое/не-finite/< 0 — submit заблокирован. Если не dirty — просто закрывается. Для пустой позиции показывает «закончился». Назначение — быстрая корректировка («на самом деле 5 кг, а не 15»).

### Consume / restock (`InventoryConsumeControl`)

Кнопка «Изменить» открывает bottom-sheet (portal) с сегмент-переключателем «− Списал / + Докупил» (`defaultMode` = `restock`, если позиция пуста, иначе `consume`). Логика расчёта — `features/inventory/consume.ts`:

- `resolveInventoryConsumeContext()` — профиль единиц, pack-эквивалент, остаток в human unit, default input unit, allowed units.
- быстрые чипы: для consume — `¼ ½ ¾ Всё` (заполняют поле долей остатка в выбранной единице через `resolveInventoryRemainingInUnit`); если есть pack-эквивалент — чип «1 пачка».
- `resolveInventoryConsumeState()` — переводит введённое количество в normalized (`resolveConsumedNormalized`; `pack` обрабатывается отдельно), затем `consume` вычитает с клампом в 0 (`Math.max(0, …)`), `restock` прибавляет; округление `roundTo(…, 3)`. Возвращает новый остаток, его human-display, флаг `willEmpty` и `submitQuantity/submitUnit` (абсолютный новый остаток для inline-action). Несовместимая единица → ошибка «Эта единица измерения не подходит…», amount ≤ 0 → «Введите количество больше нуля.».
- preview: «Останется: …» / «Станет: …» (+ «(закончится)» если обнулится).

Старый компонент `InventoryQuantityEditor` (`inventory-quantity-editor.tsx`) и его inline-кнопка «обнулить остаток» в карточке больше не рендерятся; от модуля переиспользуется только хелпер `isInventoryQuantityValueValid`. `setInventoryItemEmptyAction` / `setInventoryItemQuantityToZero` остаются в коде, но UI карточки их не вызывает — обнуление достигается consume «Всё» либо inline-вводом `0`.

### Ограничение: количество и цена

`updateInventoryQuantity` обновляет **только** `enteredQuantity`, `enteredUnit`, `normalizedQuantity`, `normalizedUnit`, `unitDimension`, `updatedAt`. Он **не пересчитывает** price fields. Поэтому после inline-правки, consume или restock сохранённые `purchasePriceMinor`, `purchaseQuantity*` и `normalizedUnitCostMinorRub` остаются от предыдущего полного add/edit расчёта — отображаемая «цена за единицу» не меняется вслед за остатком. (Проверено по коду: 2026-06-25.)

---

## Связь склад ↔ каталог

### XOR source linkage

Позиция склада связана ровно с одной сущностью: `ingredientCatalogItemId` (системный ingredient) **или** `userCustomIngredientId` (custom/derived). Гарантируется DB CHECK + zod. Склад не хранит независимую копию каталога — только user-specific остатки, привязанные к catalog/custom domain. View/detail-слой остаётся за каталогом; отдельной inventory detail page нет.

### Переходы (двусторонние)

- Из каталога: `Добавить на склад` → `/app/ingredients?addSource={catalog|custom}&addId={id}`; `Использовать в рецепте` → `/app/recipes/new?addSource=...`; для системного — `Создать свой вариант`.
- Из склада: заголовок карточки → `/catalog/system/{id}` или `/catalog/custom/{id}` (каталог публичный, см. memory: catalog-is-public).

### Unified ingredient layer

Каталог и склад работают поверх общего ingredient-слоя: `getIngredientSuggestionByRef` (deep-link), `listUserCatalogIngredients` (system + custom; custom browser через `/api/ingredients/custom` с `view: "mine"`), shared `IngredientPicker`, quick-start через `/api/ingredients/picker-quick-start`. Availability `Избранные`/`Только свои` считается серверно по тому же unified scope.

### User metadata (favorite + purchase links) общие для reference

Метаданные привязаны к `UserIngredientReference` (`catalog:{ingredientCatalogItemId}` или `custom:{userCustomIngredientId}`), а не к строке склада:

- `isFavorite`, `purchaseLinks` — общие между складом и catalog detail page;
- карточка склада показывает summary `item.source.purchaseLinks` и trigger `Купить` / `Добавить ссылку` (`IngredientPurchaseLinksDialog`); detail page показывает полный editor в секции «Где купить»;
- metadata-actions ревалидируют `/app/ingredients`, `/catalog` и detail page.

Следствие: изменение ссылок из склада сразу видно в каталоге для того же reference.

### Usage counters

Catalog detail page показывает «Использование»: `inventoryUsageCount` (по `userIngredients`) и `recipeUsageCount` (по `recipeIngredients`). Гидрируется `applyUsageCounts()` в catalog service — каталог знает, используется ли ingredient в складе/рецептах.

### Derived / custom variant

- catalog ingredient без override → позиция привязана к системному catalog item;
- catalog ingredient с batch override → системный каталог не меняется, создаётся/переиспользуется derived custom ingredient (`derivedFromIngredientId`), позиция ссылается на custom, badge `Измененный`/`Свой`, переход из склада ведёт в `/catalog/custom/...`.

То есть склад связан с каталогом либо напрямую, либо через пользовательский производный слой.

---

## Сводка известных особенностей / ограничений

- XOR source — теперь и на уровне БД (CHECK `user_ingredients_source_linkage_chk`), и в zod.
- `archiveInventoryItem` / `archivedAt` есть, но кнопка удаления делает hard delete; закончившиеся позиции (`normalizedQuantity <= 0`) не архивируются.
- Inline / consume / restock не пересчитывают цену за единицу (см. раздел выше).
- Add flow умеет derived custom при catalog override; edit flow override не поддерживает.
- Optional fields в add flow не отправляются, пока не открыли optional disclosure.
- Purchase links и favorite хранятся на ingredient reference, а не на конкретной позиции склада.
- `packageVariantId` поддержан для catalog source; для custom source всегда `null`.
- `sort=default` фактически эквивалентен сортировке по названию.
- Группа `malt` отдельно не выделяется (объединена в `fermentable`); consumables разделены на `consumable_supply` / `consumable_additive`.
- `setInventoryItemEmptyAction` существует, но в текущем UI карточки не используется.
