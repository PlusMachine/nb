# Добавление ингредиента и поиск (picker) — Reference

> **Назначение:** flow добавления ингредиента (catalog/custom/derived, deep-link) и поведение поиска в общем IngredientPicker (ranking, normalization, per-category правила, quick-start).
> **Источники истины (код):** `apps/web/components/ingredients/ingredient-picker.tsx`, `apps/web/features/ingredients/{service,ranking,normalization,picker-quick-start}.ts`
> **Обновлено:** 2026-06-25
> **См. также:** [CONTEXT.md](../../CONTEXT.md), [inventory.md](inventory.md), [ingredient-seed-schema.md](ingredient-seed-schema.md)

---

Документ описывает flow добавления ингредиента и поведение поиска в общем picker. Если документ
и код расходятся, source of truth — текущая реализация в `apps/web` и `packages/db`.

Дополнительные файлы, на которые опирается описание:

- `apps/web/components/inventory/{add-ingredient-modal,catalog-ingredient-form,custom-ingredient-panel,custom-ingredient-form,inventory-list-item}.tsx`
- `apps/web/app/(app)/app/ingredients/{page.tsx,actions.ts,metadata-actions.ts}`
- `apps/web/app/api/ingredients/{search/route.ts,picker-quick-start/route.ts,custom/route.ts}`
- `apps/web/features/ingredients/{catalog-service,taxonomy,consumables,water-treatment,presentation}.ts`
- `packages/db/scripts/catalog-seed.ts`

---

## Add-flow

### Общая модель

Flow единый и не распадается на параллельные реализации:

- одна модалка `Добавить ингредиент`;
- один верхний выбор категории;
- один segmented switch `Из каталога / Свой ингредиент`;
- один shared `IngredientPicker` для unified catalog/custom поиска;
- один server-side submit entry (`addSelectedIngredientAction`);
- один custom runtime для пользовательских и derived ingredients.

Ключевая доменная семантика:

- `catalog ingredient` и `user custom ingredient` — разные ownership/runtime сущности;
- при изменении batch-specific технических параметров catalog ingredient **не мутируется**;
- catalog без изменений параметров → прямой catalog path;
- catalog с изменением color/extract/alpha → **derived custom path**.

### Точки входа

1. CTA `Добавить ингредиент` в хедере `/app/ingredients`.
2. Та же CTA из empty state склада.
3. Deep-link / open-with-selection через query-параметры `addSource` и `addId`.

### Стартовая категория и приоритеты

При каждом открытии модалки состояние ресинхронизируется из props: `mode` сбрасывается в `catalog`,
`result`/`pending` очищаются, `catalogCategory`/`customCategory` (и subtypes) получают одно стартовое значение.

Приоритет выбора стартовой категории:

1. `initialSelection` (его `category` и при необходимости subtype);
2. иначе `initialCategory`, которую страница берёт из текущего фильтра `/app/ingredients`;
3. иначе последняя использованная категория из `localStorage`;
4. иначе мягкий default `Солод`.

Категория синхронизирована между вкладками `Из каталога` и `Свой ингредиент`. При успешном flow и при
ручном переключении категория запоминается как last used.

Список категорий в UI: `Солод`, `Сбраживаемое сырье`, `Хмель`, `Дрожжи`, `Водоподготовка`, `Расходники`.
В taxonomy `Солод` и `Сбраживаемое сырье` — это одна категория `fermentable` с subtype `malt` / `fermentable`
(см. `taxonomy.ts`). Inventory/add/edit UI использует subtype-aware labels `Солод`/`Сбраживаемое сырье`,
а generic category label остаётся `Ферментируемые`.

### Catalog vs custom режимы

**Catalog-flow** (`CatalogIngredientForm`) рендерится только при активной вкладке `Из каталога` и выбранной
категории. Stage:

1. label `Ингредиент` + shared `IngredientPicker`;
2. после выбора item: скрываются category grid и mode switch, появляется context summary
   (`Солод · Из каталога`), `IngredientSelectionCard` (label `Выбрано`), required block `Количество * / Ед. изм. *`,
   optional disclosure `Добавить цену, ссылки, даты или заметку`;
3. действие `Изменить выбор` возвращает к стадии поиска.

Важно: **catalog-tab ≠ catalog-only.** Picker в catalog-flow ищет и catalog, и existing custom (`includeCustom=true`),
custom-строки маркируются badge `СВОЙ` / `ИЗМЕНЕННЫЙ`. Пользователь может на вкладке `Из каталога` выбрать
свой ингредиент — submit-path тогда корректно уйдёт в custom inventory source.

**Custom-flow** (`CustomIngredientPanel`, вкладка `Свой ингредиент`) — browser-first: search input
`Поиск среди своих ингредиентов`, sort, кнопка `Добавить новый`, список через `GET /api/ingredients/custom`
(`category`, `subtype` для malt/fermentable, `q`, `sort`, `limit=30`; внутри `listUserCatalogIngredients(user.id, { view: "mine" })`).
Выбор существующего custom item открывает `CatalogIngredientForm` в режиме `hidePicker` (reuse того же shell,
без верхнего picker). `Добавить новый` рендерит `CustomIngredientForm`.

Inline-уточнение технических параметров (внутри `details` карточки выбранного, кнопка `Уточнить параметры` /
`Готово`) показывается только для selected **catalog** ingredient с релевантными данными:
`fermentable`/`malt` — `Цвет (EBC)` + `Экстрактивность (%)`; `hop` — `Альфа-кислота (%)`. Для
`yeast`/`water_treatment`/`consumable` блока уточнения нет.

### Submit matrix (catalog-flow)

Всегда вызывается `addSelectedIngredientAction`, дальше сервер выбирает ветку:

- selected `source === "custom"` → `addCustomIngredientToInventory(...)`;
- `ingredientCatalogItemId` без override-полей → `addCatalogIngredientAction` → `addCatalogIngredientToInventory(...)`;
- `ingredientCatalogItemId` + `fermentableColorEbc` / `fermentableExtractYieldPct` / `hopAlphaAcidPct`:
  `resolveCatalogInventoryAdditionSource(...)` проверяет реальное отличие от catalog technical data.
  - отличия нет → source остаётся `catalog`;
  - отличие есть → **derived custom path**.

Submit label: `Добавить в запасы`; при реальном override → `Добавить как свой вариант`; pending → `Сохранение...`.
Custom create: `Создать и добавить в запасы` (`addCustomIngredientAction`: `createUserCustomIngredient` →
`addCustomIngredientToInventory`).

### Derived custom path

Ownership-safe override-поведение:

- не мутирует исходный catalog ingredient;
- создаёт private user custom ingredient на базе catalog item с изменёнными параметрами;
- linkage через `derivedFromIngredientId` / `derivedFromDisplayName`;
- сначала ищется уже существующий matching derived вариант пользователя (переиспользование),
  иначе создаётся новый с candidate-именами (`базовое имя`, `имя (X EBC / Y%)`, суффиксы при конфликте);
- в карточках/списках получает badge `ИЗМЕНЕННЫЙ`;
- success message: `Свой вариант ингредиента добавлен в запасы.`

### Deep-link addSource / addId

Обрабатывается на сервере (`page.tsx`):

- читаются `addSource` и `addId`;
- если `addSource` ∈ {`catalog`, `custom`} → `getIngredientSuggestionByRef(...)`;
- найденный элемент попадает в `AddIngredientTrigger` как `initialSelection`, модалка открывается сразу (`openOnMount`);
- если deep-link не разрешился в реальный suggestion, модалка автоматически не откроется.

При `initialSelection`: категория/subtype инициализируются из selection, category grid / mode switch / picker
по умолчанию скрыты (selection stage уже завершён), сразу видна карточка и required block. `pickerValue`
внутренне синхронизируется с `primaryName`, но input не виден до `Изменить выбор`. Если selection конфликтует
с текущим category/subtype context, он игнорируется.

### Purchase links

Purchase links принадлежат **ingredient reference** (`catalog` или `custom`), а не inventory row
(в отличие от количества/цены/дат/заметки). На submit при `purchaseLinksTouched` ссылки заменяются для итогового
reference через metadata layer; в create-custom path работает draft-режим без reference, привязка после создания.

### Успех и revalidation

`ok: true` → modal закрывается → `router.refresh()`; server action делает
`revalidatePath("/app/ingredients")` и `revalidatePath("/app/catalog")`. Success messages:
`Ингредиент добавлен в запасы.` / `Свой вариант ингредиента добавлен в запасы.` /
`Собственный ингредиент создан и добавлен в запасы.`

---

## Поиск: normalization запроса

Источник: `features/ingredients/normalization.ts`.

### Когда поиск идёт

Picker ищет только если: input открыт, query после нормализации непустой и `length >= 2` (debounce ~180ms,
по docs). Если активен manufacturer-refinement и поле пустое — поиск продолжается внутри выбранного производителя.

### normalizeSearchText / normalizeAndCollapse

Базовая нормализация: `NFKC` → lowercase → `ё → е` → пунктуация (`.,;:!?()[]{}"«»'…`) в пробел → разделители
(`- _ / \ |`) в пробел → схлопывание whitespace → trim.

### buildQueryVariants (варианты запроса)

Из base-нормализации строится Set вариантов (hard cap **16**):

- **family-эквиваленты** (`applyTokenVariants`) для 8 семейств (см. `canonicalIngredientFamilyGroups`):
  `pilsner`, `pale_ale`, `munich`, `vienna`, `wheat`, `caramel`, `roasted`, `acidulated`. Например
  `пильзнер` / `pils` / `pilsner` / `пилснер` сходятся в один bucket. (Прежний док перечислял только
  pils/pale/munich/vienna — по коду семейств восемь.)
- **смена раскладки клавиатуры** (`swapKeyboardLayout`, RU⇄EN по физическим клавишам);
- **транслитерация RU → LAT** (`transliterateRuToLat`);
- **транслитерация LAT → RU** (`transliterateLatToRu`, с многобуквенными токенами `shch/zh/kh/ts/ch/sh/...`).

Для каждого производного варианта дополнительно применяется `applyTokenVariants`.

### По каким полям ищется

Общий search text кандидата собирается из: `primaryLabelRu`/`displayName`/`nameRu`/`nameEn`,
`secondaryLabelRu`, `brand`/`producer`/`manufacturer`, `productCode`, `subtype`, alias-ов, а также названий
и брендов package variants. **Но** реальный набор зависит от seed mapping по категории (см. Per-category).

### Параметры API `/api/ingredients/search` (GET)

`q`, `type`, `category`, `subtype` (для malt/fermentable), `family`, `group`, `manufacturer`,
`favoritesOnly` (`=true`), `customOnly` (`=true`), `limit` (default `10`), `includeCustom` (default `true` —
`!== "false"`). Внутри — `searchUserCatalogIngredients(user.id, ...)`.

---

## Ranking

Источник: `features/ingredients/ranking.ts`. `score = (100 - tier) * 1000 + detail` — меньший tier всегда
выигрывает, внутри tier выше score.

### Классификация intent

`analyzeQuery` определяет семейство (`resolveCanonicalFamily`), code-токены (`isCodeLikeToken`: 2–8 символов,
буквы+цифры, есть цифра) и intent:

- `generic_family` — только семейство, без контекста и кодов;
- `code_specific` — запрос целиком про код;
- `family_context` — семейство + дополнительные токены;
- `default` — остальное.

### Ветви ранжирования

1. **consumable** (`category === "consumable"`) → отдельный `buildConsumableRank`: приоритет
   package-variant полей, затем priority-aliases / market-aliases / name / alias. Package-like query
   (токен с цифрой или единицей `g/kg/ml/l/шт/...`) поднимает package-совпадения в tier 0.
2. **intent-aware** (`buildIntentAwareRank`, для не-`default` intent): family-route (primary / package /
   canonical_alias / support_alias) + code-match + brand/modifier token matches, с favorite/popularity бустами.
3. **fallback** (`buildFallbackRank`) — общая лестница tiers:

| tier | что матчит |
|------|-----------|
| 0 | name (same-script) exact |
| 1 | name prefix / token_start / all_tokens |
| 2 | name по family-вариантам (same-script) |
| 3 | alias (same-script) |
| 4 | productCode / package (same-script) |
| 5 | name (cross-script) |
| 6 | alias / code / package (cross-script) |
| 7 | brand |
| 8 | distributed-token / all-tokens по полному search text |
| 9 | fuzzy fallback (Левенштейн ≤ 2, для вариантов длиной ≥ 5) |

Концептуально это и есть последовательность **exact → family → alias → code → brand → fuzzy**.

### Бусты и tie-breakers

- `computeFavoriteBoost`: `generic_family` 18, `family_context` 12, иначе 6 (для consumable ×10).
- `computePopularityBoost`: `inventoryUsageCount*4 + recipeUsageCount*5` (cap 24) + `brandMarketCount` + 
  `sourcesCount/packageVariantsCount`; масштабируется по intent (×1 / ×0.7 / ×0.5), для consumable ×8.
- Tie-breakers вне `ranking.ts` (на уровне service/component): выше score → favorite > non-favorite →
  custom > catalog внутри одной semantic tier → алфавит. *(не проверено в этом файле)*

### Широкая выдача и refinement по производителю

Picker переходит в refinement при `total > 10`, наличии manufacturer-refinements и отсутствии выбранного
manufacturer. Видно: header `Уточнить производителя`, счётчик, до 6 chips. После выбора — chip `Производитель`,
placeholder `Искать внутри <producer>`, сужение до exact normalized manufacturer match.

Пределы: default request limit `10`; в UI broad-match сначала 6 строк; `Показать все результаты` —
расширенный fetch с hard cap `100`; quick-start `recentLimit` `10`. *(числа 6/100 — по прежнему доку, не из search route)*

---

## Per-category правила и gotchas

> Несколько прежних формулировок устарели — ниже приведено состояние по текущему коду
> (`taxonomy.ts`, `catalog-seed.ts`).

### fermentable / malt

- **Малт:** `name_ru`, `name_en`, `brand`, aliases (`aliases_ru`/`aliases_en`/`brand_aliases`), subtype `malt`.
  Brand хорошо участвует и в ranking, и в UI (inline в top row picker-строки).
- **Сбраживаемое сырьё (non-malt):** **исправлено относительно старого дока.** `prepareFermentable`
  теперь **сохраняет** `producer` (`ingredients.producer`) и aliases (`aliases_ru`/`aliases_en` через
  `buildAliasRows`), см. `catalog-seed.ts:737`. Прежнее утверждение «fermentable не сохраняет aliases/producer»
  больше неверно. *(виден ли producer downstream в picker-row/inventory-card — не проверено в catalog-service)*
- В add flow для catalog fermentable/malt доступен блок `Уточнить параметры` (`Цвет`, `Экстрактивность`).
- Subtype: верхняя сетка `Сбраживаемые` раскрывается на group-chips
  (`Концентраты`/`Сахара и сиропы`/`Фрукты и соки`/`Неосоложенка`) — они покрывают non-malt каталог полностью.

### hop

- Поиск: `name_ru`, `name_en`, `producer`, aliases (`aliases_ru`/`aliases_en`/`producer_aliases`), subtype `hop`,
  code-like токены в названии. Producer участвует в ranking и refinement, поднимается inline в picker-строке.
- В add flow для catalog hop — `Уточнить параметры` (`Альфа-кислота`). `standard` hop form скрывается в picker
  subtitle, но на inventory-badge может присутствовать как plain text.

### yeast

- Поиск: `name_ru`, `name_en`, `brand`, `product_code`, aliases (`aliases_ru`/`aliases_en`), subtype `yeast`.
  Очень хорошо ловится по product code (`BF27`, `US-05`, `AL 101`) и brand+code.
- В picker-строке brand inline **не** поднимается (в отличие от hop/malt) — он в subtitle. В modal-card brand
  поднимается наверх (`mergeBrandAndCountry = true`). Quick-start даёт brand-chips (наравне с malt).

### water_treatment

- Поиск: `name_ru`, `name_en`, aliases (`aliases_ru`/`aliases_en`), subtype из `item_kind`. В БД пишутся
  `formula`, `unit_preferred`, `item_kind`, `category`, water-specific attrs.
- **Gotcha (актуально):** subtype derivation в `normalizeIngredientSubtype` (`taxonomy.ts:190`) для
  `water_treatment` распознаёт только `water`→`water_source`, `acid`→`acid`, `salt`→`salt`, `base`→`base`,
  `chlor`→`dechlorination`, остальное → **`other`**. Многие записи имеют `item_kind = chemical`, который не
  попадает ни под один паттерн → subtype `other`, и picker-summary выглядит как слишком общий `другое · <unit>`.
- Inventory-card: при наличии `formula` она показывается перед title; `unitPreferred`-badge скрыт для `g`/`ml`
  (поэтому `L`/`mg` видны, `g` часто скрыт).

### consumable

- Поиск: `name_ru`, `name_en`, aliases, package-variant **brand** и **product name**, subtype из `item_kind`,
  плюс priority/market-термы. Это единственная категория, где package variants критичны для recall.
- **Gotcha (актуально):** matched package variant в picker-строке **не печатается** — показывается сам ingredient
  item. Запрос `Vicant SB` найдёт запись, но строка будет называться `Антиоксидант для готового пива`, а не
  именем package variant. Top-level brand для consumable обычно лежит в package variants, а не в ingredient row.
- Верхний split `Расходники` / `Другие добавки` покрывает весь `consumable` каталог; group-chips
  (`process_aid`/`sanitizer`/`cleaner`/`fining`/`enzyme`/`nutrient`/`antioxidant`/`packaging`/`gas`) покрыты хорошо.

---

## Zero-query quick-start

Источник: `features/ingredients/picker-quick-start.ts` + `POST /api/ingredients/picker-quick-start`.

**Важное уточнение к прежним докам:** quick-start включён не только для malt.
`shouldShowIngredientQuickStart` возвращает true для `hop`, `yeast`, `consumable`, `water_treatment` и
`fermentable` (subtype `malt` **или** `fermentable`), пока `enabled` и нет explicit search state:
query `< 2` символов и не активны family scope / favoritesOnly / customOnly / manufacturer / group.
Malt — самый богатый вариант (brand-chips + family-chips), поэтому в старой документации фигурировал как
единственный.

### Состав quick-start по категориям

- **malt** (`fermentable + malt`): быстрые фильтры → `По бренду` (brand-chips) → `По типу` (8 family-chips:
  Пилснер, Пэйл эль, Пшеничный, Венский, Мюнхенский, Карамельный, Жжёный, Кислый) → `Недавние`.
- **yeast**: brand-chips (`По бренду`) + `Недавние`.
- **fermentable (non-malt)** / **consumable** / **water_treatment**: group-chips (фиксированный порядок для
  consumable/water_treatment) + `Недавние`.

### Быстрые scope-фильтры

- `Только избранные` — если в unified scope реально есть favorite items (add и edit flow).
- `Только свои` — только в add flow и только если в unified scope есть custom items
  (`allowCustomOnlyFilter` не передаётся в edit). `hasCustomAvailable` считается по тому же unified scoped list
  (`listIngredientPickerQuickStart`), а не отдельным catalog-only запросом.

### API и загрузка

`POST /api/ingredients/picker-quick-start`: body `category`, `subtype` (сохраняется только `malt`/`fermentable`,
иначе `null`), `recentReferences`, `recentLimit`; внутри `listIngredientPickerQuickStart(user.id, ...)`.
Ответ: `brands`, `recent`, `hasFavoritesAvailable`, `hasCustomAvailable`. Пока грузится — отдельная
loading-panel (skeleton), верхняя строка фильтров зарезервирована заранее (add — два слота, edit — только
favorite-slot). Fallback при сбое: fallback brands остаются (`ingredientPickerMaltQuickStartFallbackBrands`),
recent пустые, availability flags `false`. Секция `Недавние` по умолчанию свёрнута (header+счётчик видны,
карточки — после `Показать все`). Recent в `localStorage` под ключом
`nb:ingredient-picker:recent-selections`.

---

## Add vs Edit различия

| | Add flow | Edit flow |
|---|---|---|
| старт | header `Добавить ингредиент`, grid категорий, mode switch, picker | header `Редактировать ингредиент на складе`, сразу выбранный ингредиент |
| смена выбора | `Изменить выбор` → возврат к поиску | `Заменить ингредиент` → category grid + picker, refocus |
| batch-override (fermentable/hop) | да, может уйти в derived custom | нет (только реплейс reference + поля складской карточки) |
| пустая выдача | CTA `Не нашли? Добавить свой ингредиент` → переключение в custom create | helper `Не нашли подходящую позицию. Уточните запрос или оставьте текущий ингредиент без изменений.` |
| quick-start `Только свои` | может появиться | не показывается |
| quick-start `Только избранные` | может появиться | может появиться |

Общее: после выбора picker stage скрывается, required block появляется только после selection; при очистке
selection optional/derived/override state сбрасываются; при смене категории с draft query (без выбора) query
сохраняется и поиск продолжается в новом context, а при готовом selection — selection и query очищаются;
context summary: add — `Солод · Из каталога`, edit — `Солод · Каталог`.

Карточка выбранного (`IngredientSelectionCard`) в обоих flow: `hideTypedSummary`, `hideSubtitle`,
`mergeBrandAndCountry` — brand поднят в top row, country только флагом, без picker-subtitle и typed summary.

---

## Известные мелкие проблемы

Актуальные на момент обновления находки по chip-фильтрам picker:

- **Пустой chip `other` в additive switch.** В `catalog-ingredient-form.tsx` additive switch показывает chip
  `other`, хотя в текущем seed-каталоге в этой группе 0 элементов → dead-end filter с пустой выдачей. Расходится
  с quick-start group logic, где `other` не показывается.
- **Неравномерная семантика chips.** Верхний ряд смешивает уровни taxonomy: `Сбраживаемые`/`Хмель`/`Дрожжи`/
  `Водоподготовка` — категории, а `Расходники`/`Другие добавки` — broad groups внутри `consumable`; `Солод` —
  то категория, то subtype. Не ломает поиск, но снижает предсказуемость.
- **Malt family-chips не исчерпывающие.** 8 quick-start family-chips — быстрый вход, а не полная карта каталога
  (часть солодов вне любой family).

**Исправлено в коде** (прежняя находка P1 более не актуальна): заголовок refinement-панели для
`water_treatment` теперь корректный. `resolveIngredientPickerRefinementPanelTitle`
(`ingredient-picker.tsx:1341`) возвращает `Уточнить группу водоподготовки` для `water_treatment`,
`Уточнить группу сбраживаемых` для `fermentable` и `Уточнить группу расходников` для остального
`consumable_group`. Старое утверждение, что для water_treatment всё ещё показывается «Уточнить группу
расходников», по текущему коду неверно.

---

## Тесты, подтверждающие поведение

- `apps/web/tests/inventory-add-flow.test.ts`
- `apps/web/tests/inventory-service.test.ts`
- `apps/web/tests/ingredient-picker.test.ts`
- `apps/web/tests/inventory-usability-components.test.ts`
- `apps/web/tests/user-catalog-ingredient-search.test.ts`
- `apps/web/tests/recipe-editor-components.test.ts`
</content>
</invoke>
