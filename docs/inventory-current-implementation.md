# Склад ингредиентов: текущая реализация

Документ описывает текущее устройство склада ингредиентов на 2026-04-11 по коду приложения. Основные точки входа:

- `/app/ingredients` — страница склада, `apps/web/app/(app)/app/ingredients/page.tsx`.
- `AddIngredientModal` — add flow, `apps/web/components/inventory/add-ingredient-modal.tsx`.
- `CatalogIngredientForm` — добавление выбранного catalog/custom ingredient через picker.
- `CustomIngredientForm` — создание своего ingredient и добавление его в склад.
- `InventoryItemDetailsEditor` — полное редактирование позиции склада.
- `InventoryQuantityEditor` — inline-редактирование остатка.

Сервисная логика находится в `apps/web/features/inventory/service.ts`, схемы payload/DTO — в `apps/web/features/inventory/contracts.ts`, единицы — в `apps/web/features/inventory/units.ts`, цены — в `apps/web/features/inventory/purchase-cost.ts`.

## 1. Модель данных

### Таблица `user_ingredients`

Описана в `packages/db/src/schema.ts`. Это таблица позиций склада, а не каталог ингредиентов.

Ключевые поля:

- `id` — UUID позиции склада.
- `userId` — владелец, FK на `users`.
- `ingredientCatalogItemId` — ссылка на системный ingredient из `ingredients`, nullable.
- `userCustomIngredientId` — ссылка на пользовательский ingredient из `user_custom_ingredients`, nullable.
- `packageVariantId` — ссылка на `ingredient_package_variants`, nullable, используется для catalog consumables/упаковок.
- `ingredientFamilyId`, `ingredientCategory`, `ingredientSubtype` — snapshot taxonomy.
- `ingredientDisplayNameSnapshot` — snapshot имени источника на момент сохранения.
- `ingredientDefaultDisplayUnitSnapshot` — snapshot default display unit.
- `ingredientMeasurementDimension` — snapshot dimension `weight | volume | count`.
- `enteredQuantity`, `enteredUnit` — количество как ввел пользователь.
- `normalizedQuantity`, `normalizedUnit` — количество в нормализованной единице.
- `unitDimension` — dimension нормализованной/введенной меры.
- `priceInputMode` — `total | per_display_unit`, режим ввода цены.
- `priceInputAmountMinor`, `priceInputCurrency` — сумма, введенная пользователем, в minor units.
- `purchasePriceMinor`, `purchaseCurrency` — расчетная итоговая цена покупки в minor units.
- `purchaseQuantity`, `purchaseQuantityUnit`, `purchaseQuantityNormalized`, `purchaseQuantityNormalizedUnit` — количество, к которому относится цена.
- `normalizedUnitCostMinorRub` — стоимость одной normalized unit в RUB minor units.
- `purchasedAt`, `freshnessDate`, `notes`.
- `archivedAt` — поле есть, но текущий UI удаления использует hard delete.
- `createdAt`, `updatedAt`.

В текущей схеме БД для `user_ingredients` нет CHECK на XOR catalog/custom linkage, но сервисные схемы требуют ровно один source.

## 2. Страница `/app/ingredients`

`MyIngredientsPage` требует авторизацию через `requireUser()`.

Из query читаются:

- `search` — строка поиска.
- `category` — новая категория ingredient taxonomy.
- `type` — legacy fallback, конвертируется в category.
- `subtype` — только `malt | fermentable`.
- `finished` и legacy `stock` — показывать законченные позиции.
- `sort` — сортировка.
- `addSource=catalog|custom` и `addId` — открыть add modal сразу с выбранным ingredient.

Страница параллельно загружает:

- `listInventoryForUser(user.id, query)` — позиции склада;
- `getInventorySummaries(user.id)` — summary по категориям и остаткам;
- `listSystemCurrencyRates()` — курсы валют для отображения цен;
- `getIngredientSuggestionByRef()` — initial selection для add modal, если пришли `addSource/addId`;
- `getIngredientPickerQuickStartByContext()` — quick-start данные для picker в add modal.

Если пользователь запросил показ finished, но `summary.emptyItems === 0`, страница редиректит на тот же URL без `finished=true`.

## 3. Фильтры, группировка и список

Toolbar (`InventoryToolbar`) управляет URL через `router.replace`:

- поиск debounce `250ms`;
- категории: `malt`, `fermentable`, `hop`, `yeast`, `water_treatment`, `consumable`;
- переключатель законченных позиций появляется только если есть `emptyItems`;
- сортировки: `default`, `name`, `quantity`, `updated`, `best_before`, `price`.

Сервис `listInventoryForUser()`:

- выбирает `user_ingredients` left join `ingredients`, `user_custom_ingredients`, `ingredient_package_variants`;
- фильтрует по `userId`, `archivedAt is null`, если archived не включен;
- фильтрует по `ingredientCategory` и поиску;
- после map в DTO дополнительно фильтрует по `type`, `subtype`, stock state;
- если `stockState = in_stock`, оставляет `normalizedQuantity > 0`;
- если `stockState = empty`, оставляет `normalizedQuantity <= 0`;
- если stock all, но `includeEmpty = false`, тоже оставляет только `normalizedQuantity > 0`;
- сортирует.

Сортировка:

- `quantity`: по `normalizedQuantity desc`;
- `updated`: по `updatedAt desc`;
- `best_before`: по `freshnessDate asc`, пустые даты в конец;
- `price`: по `normalizedUnitCostMinorRub desc`, пустая цена как `-1`;
- default/name: по `source.primaryLabelRu` locale `ru`.

`groupInventoryItems()` группирует позиции в порядке:

- `malt`;
- `fermentable`;
- `hop`;
- `yeast`;
- `water_treatment`;
- `consumable`.

Внутри группы сначала идут позиции в наличии (`normalizedQuantity > 0`), потом законченные.

## 4. DTO позиции склада

`mapInventoryRow()` собирает `InventoryListItemDto` из row и resolved source.

Source может быть:

- `catalog` — строится через `buildCatalogSourceDto()` и `buildCatalogIngredientLinkage()`;
- `custom` — строится через `buildCustomSourceDto()` и `buildCustomIngredientLinkage()`;
- fallback snapshot — если live source недоступен, используется snapshot из `user_ingredients`.

DTO содержит:

- ссылки на catalog/custom/package variant;
- snapshot taxonomy/display/unit fields;
- entered/normalized quantity;
- price input fields и расчетные purchase fields;
- dates/notes/archive timestamps;
- `source` с display names, brand/country, technicalData, unit profile, summary, purchase link summary.

Для purchase links после маппинга вызывается `applyPurchaseLinkSummariesToInventoryItems()`, который загружает summary по reference `sourceKind:sourceId`.

## 5. Add flow: общий контейнер

`AddIngredientTrigger` открывает `AddIngredientModal`. Modal хранит:

- режим `catalog | custom`;
- выбранную category/subtype отдельно для catalog и custom;
- выбранный ingredient;
- pending/result.

Начальная категория выбирается так:

1. Если есть `initialSelection` и это fermentable `malt|fermentable`, берется subtype.
2. Если есть `initialSelection.category`, берется category.
3. Если есть `initialCategory=fermentable` и initial subtype `malt|fermentable`, берется subtype.
4. Если есть `initialCategory`, берется category.
5. Иначе берется remembered value из `localStorage` key `nb:add-ingredient:last-category`.
6. Если ничего нет — `malt`.

При успешном submit modal закрывается и делает `router.refresh()`. Последняя категория сохраняется в localStorage.

## 6. Add flow: из каталога или существующего custom ingredient

В режиме `catalog` используется `CatalogIngredientForm`, но название режима историческое: picker может выбрать и catalog, и custom ingredient.

### Поиск

`IngredientPicker` ходит в `GET /api/ingredients/search`, а route вызывает `searchUserCatalogIngredients()`. В выдаче участвуют:

- системный каталог `ingredients`;
- пользовательские `user_custom_ingredients`, если `includeCustom` не выключен;
- фильтры category/subtype/family/group/manufacturer/favorites/customOnly;
- ranking по названию, алиасам, бренду, product code, usage counts, package variants и другим признакам.

Если ничего не найдено, empty CTA предлагает перейти в режим `Добавить свой`.

### Payload

`buildCatalogIngredientPayload()` требует selected ingredient и собирает:

- `ingredientCatalogItemId`, если `selected.source === "catalog"`;
- `userCustomIngredientId`, если `selected.source === "custom"`;
- `enteredQuantity`;
- `enteredUnit`;
- опционально `priceInputMode`, `priceInputAmount`, `purchasedAt`, `freshnessDate`, `notes`;
- если purchase links были загружены/изменены — `purchaseLinksTouched` и `purchaseLinks`;
- если включен batch override — `fermentableColorEbc`, `fermentableExtractYieldPct`, `hopAlphaAcidPct`.

Опциональные поля не уходят, пока пользователь не открыл optional disclosure.

### Server action

`addSelectedIngredientAction()` ветвится так:

- если есть `userCustomIngredientId`, вызывает `addCustomIngredientToInventory()`;
- если есть `ingredientCatalogItemId` и нет technical overrides, делегирует в `addCatalogIngredientAction()`;
- если есть catalog id и есть overrides, вызывает `resolveCatalogInventoryAdditionSource()`.

`resolveCatalogInventoryAdditionSource()`:

- читает catalog ingredient;
- сравнивает override с текущими catalog technical data;
- если override фактически не меняет значения — возвращает catalog source;
- если меняет — создает или переиспользует derived custom ingredient и возвращает custom source.

Derived custom создается для:

- fermentable/malt: изменение `fermentableColorEbc` или `fermentableExtractYieldPct`;
- hop: изменение `hopAlphaAcidPct`.

Имя derived custom строится из display name и descriptor:

- для fermentable: `N EBC / N%`;
- для hop: `N% AA`;
- если имя занято другим ingredient, пробуются варианты с суффиксами `2`, `3`.

Каталог при этом не изменяется. В склад добавляется custom ingredient с `derivedFromIngredientId` и `derivedFromDisplayName`.

После успешного добавления:

- revalidate `/app/ingredients`;
- revalidate `/app/catalog`;
- если purchase links touched, они сохраняются через `replaceIngredientPurchaseLinksForReference()`.

## 7. Add flow: создать свой ingredient

В режиме `custom` используется `CustomIngredientForm`.

Форма отправляет:

- taxonomy: `type`, `category`, `subtype`;
- `displayName`;
- `brand`, `country`, `harvestYear`;
- technical fields по категории:
  - fermentable: `fermentableColorEbc`, `fermentableExtractYieldPct`;
  - hop: `hopAlphaAcidPct`, `hopForm`;
  - yeast: `yeastAttenuationPct`, `yeastForm`;
- `defaultDisplayUnit`;
- required stock fields: `enteredQuantity`, `enteredUnit`;
- optional fields: price/date/notes/purchase links, если disclosure открыт.

Action `addCustomIngredientAction()`:

1. Создает custom ingredient через `createUserCustomInventoryIngredient()`.
2. Добавляет его в склад через `addCustomIngredientToInventory()`.
3. Если purchase links touched, сохраняет links на reference `custom:{customIngredient.id}`.
4. Revalidate `/app/ingredients` и `/app/catalog`.

Важно: `createUserCustomInventoryIngredientSchema` не требует technical fields. Поэтому custom ingredient из add-to-inventory flow можно создать без цвета/экстрактивности/AA/аттенюации, в отличие от полной catalog-form схемы `createUserCustomIngredientSchema`.

## 8. Нормализация количества

Единицы описаны в `features/inventory/units.ts`:

- weight: `g`, `kg`, `oz`, `lb`;
- volume: `ml`, `l`, `gal`;
- count: `item`, `pack`.

`resolveInventoryUnitProfile()` строит профиль:

1. Сначала учитывает `quantityDefaults` из catalog ingredient, если они есть.
2. Затем применяет practical yeast profile:
   - dry yeast: default `pack`, allowed `pack`, `g`, dimension `count`;
   - liquid/slurry/culture yeast: default `ml`, если explicit default не задан.
3. Затем explicit `defaultDisplayUnit/allowedUnits/measurementDimension`.
4. Затем fallback taxonomy `resolveIngredientUnits()`.
5. Если ничего нет — default `g`, weight units.

`resolveHumanFacingInventoryUnitProfile()` меняет default для удобства UI:

- fermentable -> `kg`, если разрешен;
- hop -> `g`, если разрешен;
- water_treatment acid -> `ml`, иначе `g`, если разрешен;
- yeast -> `pack`, если разрешен;
- consumable оставляет профиль как есть.

`normalizeInventoryMeasurementForProfile()`:

- парсит unit;
- проверяет, что unit разрешен profile;
- округляет entered quantity до 3 знаков;
- weight нормализует в `g`;
- volume нормализует в `ml`;
- count оставляет в entered count unit.

### `pack`

`normalizeMeasurementWithPackageVariant()` добавляет special cases:

- если выбран catalog `packageVariant`, entered unit `pack`, и у variant есть `stockContentAmount/stockContentUnit`, то normalized quantity = `enteredQuantity * stockContentAmount`, normalized unit = `stockContentUnit`.
- если entered unit `pack` и есть yeast technical package equivalent, используется `resolveInventoryPackEquivalent()`.
- иначе используется обычная нормализация по profile.

`resolveInventoryPackEquivalent()` сейчас работает только для yeast:

- если в technicalData есть `packageSize/packageUnit`, конвертирует package size в `g` или `ml`;
- если yeast dry и package size нет — fallback `1 pack = 11 g`;
- для остальных ingredient types возвращает `null`.

## 9. Нормализация цены

Цена вводится через `InventoryPriceInput`.

Режимы:

- `total` — сумма за весь введенный stock quantity;
- `per_display_unit` — цена за human display unit.

На UI preview:

- если mode `per_display_unit`, helper показывает расчет total;
- если mode `total`, helper показывает примерную цену за display unit.

Server-side `normalizeInventoryPurchaseContext()`:

1. Берет `priceInputAmountMinor`; если его нет, price fields становятся `null`.
2. Определяет `priceInputMode`, default `total`.
3. Определяет `priceInputCurrency`, default preferred currency пользователя, затем `RUB`.
4. Если mode `per_display_unit`, `purchasePriceMinor = priceInputAmountMinor * displayQuantity`.
5. Если mode `total`, `purchasePriceMinor = priceInputAmountMinor`.
6. `purchaseQuantity` по умолчанию берется из fallback measurement — того количества, которое добавляется в склад.
7. `purchaseQuantity` нормализуется тем же unit profile.
8. `normalizedUnitCostMinorRub = convertCurrencyMinorToRubMinor(purchasePriceMinor, currency, rates) / purchaseQuantityNormalized`, округление `Math.round`.

В БД сохраняются и исходный input (`priceInput*`), и расчетный purchase total/cost (`purchase*`, `normalizedUnitCostMinorRub`).

При отображении `buildInventoryCostDisplay()`:

- total price конвертируется из `purchaseCurrency` в preferred currency пользователя;
- unit price берется из `normalizedUnitCostMinorRub`, переводится в цену за human display unit и preferred currency.

## 10. Добавление catalog позиции в сервисе

`addCatalogIngredientToInventory(userId, payload, context)`:

1. Валидирует `addCatalogInventoryItemSchema`.
2. Проверяет, что catalog ingredient активен.
3. Проверяет `packageVariantId`, если он передан и должен принадлежать ingredient.
4. Строит `linkage = buildCatalogIngredientLinkage(catalogItem)`.
5. Строит profile/category/subtype через `buildCatalogProfile()`.
6. Нормализует количество через `normalizeMeasurementWithPackageVariant()`.
7. Нормализует price context через `normalizeInventoryPurchaseContext()`.
8. Insert в `user_ingredients`:
   - `ingredientCatalogItemId = catalogItem.id`;
   - `userCustomIngredientId = null`;
   - `packageVariantId = variant.id | null`;
   - snapshot category/subtype/display/default unit/dimension;
   - entered/normalized quantity;
   - price fields;
   - dates/notes.

## 11. Добавление custom позиции в сервисе

`addCustomIngredientToInventory(userId, payload, context)`:

1. Валидирует `addCustomInventoryItemSchema`.
2. Проверяет, что custom ingredient принадлежит пользователю.
3. Строит `linkage = buildCustomIngredientLinkage(customIngredient)`.
4. Строит unit profile из linkage.
5. Нормализует количество.
6. Нормализует price context.
7. Insert в `user_ingredients`:
   - `ingredientCatalogItemId = null`;
   - `userCustomIngredientId = customIngredient.id`;
   - `packageVariantId = null`;
   - snapshot category/subtype/display/default unit/dimension;
   - entered/normalized quantity;
   - price fields;
   - dates/notes.

## 12. Полное редактирование позиции

`InventoryItemDetailsEditor` открывается из карточки склада по иконке карандаша.

Начальное состояние:

- source превращается в `IngredientSuggestionItem` через `resolveInventoryEditorInitialSelection()`;
- отображаемое количество вычисляется через `resolveInventoryMeasurementForDisplay()`;
- price input amount конвертируется из сохраненной валюты в preferred currency пользователя;
- даты форматируются как `YYYY-MM-DD`.

В редакторе можно:

- заменить ingredient через picker;
- сменить category/subtype перед новым выбором;
- изменить quantity/unit;
- открыть optional section и изменить price/date/notes/purchase links.

Ограничение: edit flow не содержит UI для catalog technical overrides. Если заменить позицию на catalog ingredient, она сохранится как catalog source без derived custom override.

Submit вызывает `updateInventoryItemAction()`, затем `updateInventoryItem()`.

`updateInventoryItem()`:

- требует существующую позицию текущего user;
- требует ровно один source;
- если source catalog:
  - проверяет catalog ingredient;
  - проверяет package variant;
  - строит catalog profile/linkage;
  - нормализует quantity и price;
  - обновляет source fields, snapshot, quantity, price, dates, notes, updatedAt;
- если source custom:
  - проверяет ownership;
  - строит custom linkage/profile;
  - нормализует quantity и price;
  - обновляет source fields, snapshot, quantity, price, dates, notes, updatedAt;
  - `packageVariantId` сбрасывается в `null`.

Если purchase links touched, action сохраняет links на новый selected reference.

## 13. Inline-редактирование остатка

`InventoryQuantityEditor` показывается в карточке справа.

Начальное отображаемое количество:

- берется не напрямую из `enteredQuantity`, а через `resolveInventoryMeasurementForDisplay()`;
- если human default unit отличается, UI может показать конвертированное значение.

Можно:

- изменить quantity/unit и нажать `OK` или Enter;
- Escape сбрасывает draft;
- если quantity > 0 и draft не dirty, нажать `обнулить остаток`.

Inline submit вызывает `updateInventoryInlineAction()` -> `updateInventoryQuantity()`.

`updateInventoryQuantity()`:

- проверяет ownership;
- повторно читает row с live source/package variant;
- строит unit profile по текущему source;
- нормализует новое количество;
- обновляет только `enteredQuantity`, `enteredUnit`, `normalizedQuantity`, `normalizedUnit`, `unitDimension`, `updatedAt`.

Важно: inline quantity update не пересчитывает price fields. Если количество меняется, сохраненные `purchasePriceMinor`, `purchaseQuantity*`, `normalizedUnitCostMinorRub` остаются от предыдущего полного add/edit расчета.

`setInventoryItemQuantityToZero()`:

- выставляет `enteredQuantity = 0`;
- `normalizedQuantity = 0`;
- не меняет units и price fields;
- используется через action `setInventoryItemEmptyAction()`, но текущий inline UI фактически вызывает общий `updateInventoryInlineAction()` с `"0"`.

## 14. Удаление, архив и законченные позиции

В сервисе есть:

- `archiveInventoryItem()` — ставит `archivedAt = now`, `updatedAt = now`;
- `deleteInventoryItem()` — hard delete строки.

Текущий UI `DeleteInventoryItemButton` вызывает `deleteInventoryItemAction()`, а action вызывает hard delete. Пользователь видит confirm dialog: позиция будет удалена из запасов без возможности восстановления.

Закончившиеся позиции — это не архив, а `normalizedQuantity <= 0`. Они остаются в таблице и могут отображаться через `finished=true`.

`getInventorySummaries()`:

- игнорирует `archivedAt`;
- считает `totalItems`, `inStockItems`, `emptyItems`;
- считает `byCategory` и `inStockByCategory`;
- для fermentable отдельно считает subtype `malt` и `fermentable`;
- in-stock определяется как `normalizedQuantity > 0`.

## 15. Поиск по складу

Toolbar search:

- текстовый фильтр в `listInventoryForUser()` ищет по `coalesce(userIngredients.ingredientDisplayNameSnapshot, ingredients.nameRu, ingredients.nameEn, userCustomIngredients.displayName) ilike %term%`.

Autocomplete:

- `InventorySearchInput` ходит в `GET /api/inventory/suggestions`;
- route вызывает `searchInventorySuggestions()`;
- внутри используется `listInventoryForUser()` с `search = q`;
- результаты dedupe по `sourceKind:sourceId:packageVariantId`;
- limit 1..20, default 10;
- ответ возвращается в формате ingredient suggestion.

## 16. Карточка позиции склада

`InventoryListItem` показывает:

- primary/secondary display name;
- ссылку на detail page:
  - custom -> `/app/catalog/custom/{sourceId}`;
  - catalog -> `/app/catalog/system/{sourceId}`;
- badge `Свой` для custom ingredient;
- badge `Измененный` для derived custom ingredient;
- badge `Архив`, если `archivedAt`;
- technical badges по category:
  - hop: alpha acid, form, harvest year;
  - malt/fermentable: color EBC, extract, max usage;
  - yeast: form, attenuation, fermentation temp range;
  - water_treatment: preferred unit, если не `g/ml`;
  - consumable: common form / usage stage;
- total price и unit price, если есть;
- purchasedAt;
- freshnessDate с предупреждением:
  - expired, если дата меньше `Date.now()`;
  - critical, если осталось меньше 30 дней;
- purchase links trigger;
- notes;
- inline quantity editor;
- actions: zero, edit, delete.

## 17. Purchase links

Purchase links принадлежат не позиции склада, а ingredient reference:

- catalog reference: `{ source: "catalog", id: ingredientCatalogItemId }`;
- custom reference: `{ source: "custom", id: userCustomIngredientId }`.

В add/edit optional section `IngredientPurchaseLinksField` загружает/редактирует links для reference. Если field был загружен и state touched, action вызывает `replaceIngredientPurchaseLinksForReference()`.

Для custom ingredient, который еще не создан, `CustomIngredientForm` использует `allowDraftWithoutReference`; links уходят вместе с form payload и сохраняются после создания custom ingredient.

## 18. Известные особенности текущей реализации

- В `user_ingredients` нет DB-level CHECK на XOR source, но сервисные zod-схемы это проверяют.
- `archiveInventoryItem()` есть в сервисе, но текущая кнопка удаления делает hard delete.
- Законченные позиции не архивируются: это строки с `normalizedQuantity <= 0`.
- Inline update количества не пересчитывает цену за единицу.
- Add flow умеет создать derived custom ingredient при catalog technical override; edit flow такой override не поддерживает.
- Optional fields в add flow не отправляются, пока optional disclosure не открывали.
- Purchase links хранятся на ingredient reference, а не на конкретной позиции склада.
- `packageVariantId` поддержан для catalog source; для custom source всегда сбрасывается в `null`.
