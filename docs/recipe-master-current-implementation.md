# Мастер рецептов: текущая реализация

Документ описывает текущее устройство мастера рецептов на 2026-04-11 по коду приложения. Основные точки входа:

- `/app/recipes` — список рецептов пользователя, `apps/web/app/(app)/app/recipes/page.tsx`.
- `/app/recipes/new` — создание рецепта, `apps/web/app/(app)/app/recipes/new/page.tsx`.
- `/app/recipes/[id]/edit` — редактирование рецепта, `apps/web/app/(app)/app/recipes/[id]/edit/page.tsx`.
- `/app/recipes/[id]` — legacy route, сразу редиректит на `/app/recipes/[id]/edit`.
- `/recipes/[slug]` — публичная страница опубликованного рецепта, `apps/web/app/(public)/recipes/[slug]/page.tsx`.

Главный UI мастера — `apps/web/components/recipes/recipe-designer.tsx`. Обертки над ним: `recipe-editor-page.tsx` показывает бейджи приватности/автосохранения, `recipe-form.tsx` просто прокидывает props в `RecipeDesigner`.

## 1. Модель данных

### Таблица `recipes`

Описана в `packages/db/src/schema.ts`.

Ключевые поля:

- `id` — UUID рецепта.
- `authorId` — владелец, FK на `users`.
- `recipeFamilyId` — UUID семейства версий рецепта.
- `versionNumber` — номер версии внутри семейства, по умолчанию `1`.
- `publicationState` — enum `draft | private | published`, дефолт БД `draft`.
- `title`, `slug`, `styleId`.
- `batchSizeEnteredQuantity`, `batchSizeEnteredUnit` — значение объема партии как ввел пользователь.
- `batchSizeNormalizedQuantity`, `batchSizeNormalizedUnit` — нормализованный объем. Сейчас объем нормализуется в `ml`.
- `efficiency` — эффективность, nullable.
- `boilTimeMinutes` — время кипячения, default `60`.
- `og`, `fg`, `abv`, `ibu`, `color` — сохраненный snapshot расчетов. `color` хранится в SRM.
- `description` — публичное описание.
- `authorNotes` — приватные заметки автора.
- `processMeta` — JSON с профилями затирания/брожения.
- `heroImageId` — пока только поле, публичный UI показывает заглушку.
- `createdAt`, `updatedAt`.

Индексы: по автору, семейству, publication state, уникальный `slug`, уникальная пара `(recipeFamilyId, versionNumber)`.

### Таблица `recipe_ingredients`

Каждая позиция ингредиента хранится отдельно и ссылается либо на системный каталог, либо на пользовательский ингредиент:

- `recipeId` — FK на `recipes`, cascade delete.
- `ingredientCatalogItemId` — ссылка на `ingredients`, nullable, on delete set null.
- `userCustomIngredientId` — ссылка на `user_custom_ingredients`, nullable, on delete set null.
- CHECK `recipe_ingredients_source_linkage_chk`: ровно один источник должен быть заполнен.
- `ingredientFamilyId`, `ingredientCategory`, `ingredientSubtype`.
- `ingredientDisplayNameSnapshot`, `ingredientDefaultDisplayUnitSnapshot`, `ingredientMeasurementDimension` — snapshot части данных источника на момент сохранения.
- `type` — legacy ingredient type.
- `amountEnteredQuantity`, `amountEnteredUnit` — введенное количество.
- `amountNormalizedQuantity`, `amountNormalizedUnit` — нормализованное количество.
- `stage` — `mash | boil | whirlpool | fermentation | packaging | other`.
- `timeOffset` — целое число минут, nullable.
- `stepMeta` — JSON с деталями использования.

## 2. Создание рецепта

### Вход в `/app/recipes/new`

`NewRecipePage` требует авторизацию через `requireUser()`.

Если в query есть `recipeId`, страница сразу редиректит на `/app/recipes/{recipeId}/edit`. Это используется после автосоздания рецепта, чтобы закрепить URL за уже созданной записью.

Для нового рецепта подготавливаются:

- `initialTitle` через `getNextDefaultRecipeTitle(user.id)`.
- `initialIngredientSelection`, если в query есть `addSource=catalog|custom` и `addId`. В этом случае `getIngredientSuggestionByRef(user.id, source, id)` достает ingredient suggestion, и мастер сразу открывает редактор новой позиции с этим ингредиентом.

### Дефолты нового рецепта в UI

В `RecipeDesigner` для нового рецепта используются:

- `title` — `initialTitle` или пустая строка.
- `styleId` — пустая строка.
- `description`, `authorNotes` — пустые строки.
- `publicationState` — через `normalizeEditorPublicationState(undefined)`, то есть `private`.
- `batchSize` — `20 l`.
- `efficiency` — `75`.
- `boilTimeMinutes` — `60`.
- `processMeta` — `defaultRecipeProcessMeta`.
- `ingredients` — пустой список.

Важная деталь: хотя enum поддерживает `draft`, UI мастера нормализует все непубличное состояние в `private`. Новый рецепт из мастера создается как `private`, не как `draft`.

## 3. Редактирование рецепта

`EditRecipePage` требует пользователя, вызывает `getOwnedRecipeById(user.id, id)` и отдает DTO в `RecipeEditorPage`. Если рецепт не найден или не принадлежит пользователю — `notFound()`.

В `RecipeDesigner` данные рецепта раскладываются в локальный state:

- поля рецепта напрямую (`title`, `styleId`, `description`, `authorNotes`, `publicationState`, batch/efficiency/boil);
- `processMeta` клонируется через `cloneRecipeProcessMeta`;
- ингредиенты преобразуются из `RecipeDetailDto["ingredients"]` в `DesignerIngredient` через `toDesignerIngredient`.

При чтении ингредиента `hydrateRecipeIngredientDto()` пытается подтянуть live-связку:

- если есть `ingredientCatalogItemId` — читает активный catalog ingredient;
- если есть `userCustomIngredientId` — читает custom ingredient владельца;
- если live-связка недоступна, использует snapshot/meta fallback.

## 4. Ингредиенты в мастере

### Категории

UI группирует позиции по категориям:

- `fermentable` — "Сбраживаемое".
- `hop` — "Хмель".
- `yeast` — "Дрожжи".
- `water_treatment` — "Водоподготовка".
- `consumable` — "Расходники".

Хмель дополнительно группируется по `recipeHopUseTypes`:

- `boil`;
- `whirlpool`;
- `dry_hop`;
- `dip_hop`;
- `other`.

### Создание пустой позиции

`createEmptyIngredient(category, hopUseType)` создает локальный `DesignerIngredient`:

- генерирует `localId`;
- источник (`ingredientCatalogItemId`/`userCustomIngredientId`) пустой;
- выбирает default unit через `resolveHumanFacingInventoryUnitProfile`;
- для хмеля выставляет `stage` по `hopUseType`;
- для сбраживаемых выставляет `stage = "mash"` и `stepMeta.use = "mash"`;
- для дрожжей выставляет `stage = "fermentation"`;
- для остальных — `stage = "other"`.

### Выбор ингредиента

В редакторе позиции используется общий `IngredientPicker`.

Поиск идет через `GET /api/ingredients/search`, который вызывает `searchUserCatalogIngredients(user.id, params)`. В поиске участвуют:

- системные catalog ingredients из таблицы `ingredients`;
- пользовательские custom ingredients из `user_custom_ingredients`, если `includeCustom` не выключен;
- quick filters: category, subtype, family, group, manufacturer, favoritesOnly, customOnly;
- ranking по нормализованному тексту, алиасам, бренду/производителю, product code, usage counts, package variants и другим признакам.

Когда пользователь выбирает suggestion:

- если `item.source === "catalog"`, заполняется `ingredientCatalogItemId = item.id`, `userCustomIngredientId = null`;
- если `item.source === "custom"`, заполняется `userCustomIngredientId = item.id`, `ingredientCatalogItemId = null`;
- обновляются `selectedName`, `selectedSecondaryName`, `selectedSummary`, `familyDisplayName`, category/subtype/type, default unit, allowed units, measurement dimension.

Если пользователь меняет строку поиска после выбора, `applyQueryChange()` сбрасывает источник и возвращает позицию в состояние "не выбран ингредиент".

### Создание своего ингредиента из мастера

Если поиск ничего не нашел, empty CTA предлагает:

- `Создать свой ингредиент`;
- `Предложить ингредиент в каталог`.

`Создать свой ингредиент` вызывает `createRecipeCustomIngredientAction()`:

- требует пользователя;
- вызывает `createUserCustomInventoryIngredient(user.id, ...)`;
- передает category, subtype, displayName, defaultDisplayUnit, visibility `private`;
- строит `IngredientSuggestionItem` через `buildCustomIngredientLinkage`;
- возвращает item с `source: "custom"`;
- выбранная позиция сразу применяет этот item через `applySelection()`.

`Предложить ингредиент в каталог` вызывает `proposeRecipeIngredientAction()`:

- создает proposal через `createProposedIngredient`;
- `sourceType` ставится `recipe_designer`;
- в `sourcePayload` сохраняются category/subtype.

Предложение не добавляет ингредиент в рецепт автоматически.

### Валидация позиции

Позицию можно сохранить из модального редактора только если:

- выбран catalog или custom source;
- количество является конечным числом `> 0`.

Количество можно менять inline в списке. Для хмеля с `boil`, `whirlpool`, `dip_hop` inline также редактируются минуты.

### `stepMeta` по категориям

При сборке payload `buildIngredientPayload()` записывает:

- для fermentable: `stepMeta.use`, только если use не `mash`;
- для hop: `stepMeta.useType`;
- `timeMinutes`, если заполнено;
- `temperatureC`, если заполнено;
- `durationDays`, если заполнено;
- `fermentationTempC`, если заполнено;
- `stageLabel`, если непустой.

Для хмеля `stage` всегда пересчитывается из `useType`:

- `boil` -> `boil`;
- `whirlpool` -> `whirlpool`;
- `dry_hop` -> `fermentation`;
- остальное -> `other`.

## 5. Параметры процесса

`processMeta` валидируется схемой `recipeProcessMetaSchema`.

Дефолт:

```json
{
  "mashProfile": {
    "steps": [
      {
        "id": "mash-step-1",
        "name": "Основной настой",
        "temperatureC": 67,
        "durationMinutes": 60
      }
    ]
  },
  "fermentationProfile": {
    "primaryTemperatureC": 20,
    "primaryDurationDays": 10,
    "extraSteps": [],
    "coldCrash": {
      "enabled": false,
      "temperatureC": 2,
      "durationDays": 2
    },
    "conditioning": {
      "enabled": false,
      "temperatureC": 12,
      "durationDays": 14
    }
  }
}
```

Ограничения:

- mash steps: минимум 1, максимум 10; температура 0..100 °C; duration 1..600 минут.
- fermentation primary temperature: -10..50 °C, nullable.
- fermentation primary duration: 1..365 дней, nullable.
- extra fermentation steps: максимум 10; temperature -10..50 °C; duration 1..365 дней.
- coldCrash/conditioning: `enabled`, nullable temperature/duration с теми же диапазонами.

Сейчас `processMeta` сохраняется и валидируется, но не участвует в расчетах OG/FG/ABV/IBU/color.

## 6. Автосохранение и сохранение

`RecipeDesigner` собирает `payload` из локального state:

- title;
- styleId;
- description;
- authorNotes;
- publicationState;
- batchSizeEnteredQuantity/unit;
- efficiency;
- boilTimeMinutes;
- processMeta;
- ingredients.

`savePayload = normalizeSavePayload(payload)` подставляет UI-дефолты для некорректных чисел:

- batch size: `20 l`;
- boil time: `60`.

Автосохранение:

- `currentSignature = JSON.stringify(payload)`;
- если signature отличается от `savedSignature`, ставится таймер 1500 мс;
- перед сохранением `buildAutosaveBlockedResult()` проверяет zod-схему и publication validation;
- если есть ошибки, save блокируется и signature помечается как `blockedSignature`;
- если ошибок нет, вызывается `createRecipeAction` или `updateRecipeAction`.

Для превью расчетов отдельный debounce 400 мс: `previewRecipeDraftAction(savePayload)`.

После успешного первого create:

- `activeRecipeId` заполняется id созданного рецепта;
- `RecipeEditorPage` переключает `editorMode` в `edit`;
- если пользователь все еще на `/app/recipes/new`, через 250 мс URL заменяется на `/app/recipes/new?recipeId={id}`;
- при следующей серверной загрузке такой URL редиректит на `/app/recipes/{id}/edit`.

Server actions после create/update делают `revalidatePath` для:

- `/app/recipes`;
- `/app/recipes/{id}`;
- `/app/recipes/{id}/edit`.

Delete дополнительно инвалидирует `/recipes` и публичный `/recipes/{slug}`, если slug есть.

## 7. Как сервис сохраняет рецепт

### `createRecipe(authorId, payload)`

Порядок:

1. Нормализует create payload defaults.
2. Валидирует `createRecipePayloadSchema`.
3. Готовит ингредиенты через `prepareRecipeIngredientEntries()`.
4. Парсит `processMeta`.
5. Проверяет требования публикации через `validateRecipeForPublicationState()`.
6. Нормализует batch size через `normalizeRecipeBatchSize()`.
7. Генерирует уникальный slug из title через `resolveUniqueRecipeSlug()`.
8. Вставляет строку в `recipes`.
9. Полностью заменяет ingredients через `replaceRecipeIngredients()`.
10. Пересчитывает stats через `recomputeRecipeStats()`.
11. Возвращает `getRecipeById(authorId, created.id)`.

Slug при коллизии пытается пересоздаться до 5 раз. Базовая логика slug вынесена в `features/recipes/slug.ts`.

### `updateRecipe(authorId, recipeId, payload)`

Порядок:

1. Валидирует update payload.
2. Проверяет владение рецептом через `ensureOwnedRecipe()`.
3. Если ingredients не пришли, берет текущие из `getOwnedRecipeById()`.
4. Готовит next ingredients и проверяет publication state.
5. Если поменялся title, пересчитывает slug.
6. Обновляет строку `recipes`.
7. Если в payload есть ingredients, полностью удаляет старые `recipe_ingredients` и вставляет новые.
8. Если `recomputeStats` true, пересчитывает stats.
9. Возвращает `getRecipeById(authorId, recipeId)`.

В action `updateRecipeAction()` всегда передает `recomputeStats: true`.

### Подготовка ингредиентов

`prepareRecipeIngredientEntries()` для каждой позиции:

- если есть `ingredientCatalogItemId`, требует активный catalog ingredient через `ensureCatalogIngredientExists()`;
- если есть `userCustomIngredientId`, требует custom ingredient текущего пользователя через `ensureOwnedCustomIngredient()`;
- строит normalized source linkage через `buildCatalogIngredientLinkage()` или `buildCustomIngredientLinkage()`;
- проверяет, что payload type/category/subtype/familyId не конфликтуют с source linkage;
- нормализует количество через `normalizeRecipeIngredientAmountWithSource()`;
- чистит `stepMeta` от устаревшего `ingredientLinkage`.

`replaceRecipeIngredients()` всегда делает delete all by `recipeId`, потом bulk insert новых строк. Это означает, что id позиций ингредиентов при каждом полном сохранении пересоздаются.

## 8. Нормализация единиц

Логика в `apps/web/features/recipes/units.ts`.

Batch size:

- принимаются только volume units;
- entered quantity округляется до 3 знаков;
- normalized unit всегда `ml`;
- `toBatchVolumeLiters()` делит normalized ml на 1000 и округляет до 3 знаков.

Ингредиенты:

- unit парсится через inventory unit profile;
- для weight units normalized unit всегда `g`;
- для volume units normalized unit всегда `ml`;
- для count units normalized unit остается такой же count unit;
- entered и normalized quantities округляются до 3 знаков на уровне helper-ов brewing core/inventory.

Профиль единиц зависит от source linkage: type, category, subtype, defaultDisplayUnit, allowedUnits, measurementDimension, technicalData.

## 9. Расчеты показателей

Расчеты идут в `computeRecipeStatsSnapshot()` и используют `@nb/brewing-core`.

Вход:

- batch volume в литрах;
- `efficiency`, если пусто — `75`;
- `boilTimeMinutes`, если пусто — `60`;
- подготовленные ingredients с нормализованными количествами и техническими данными источника.

### Какие ингредиенты участвуют

Fermentables:

- учитываются ingredient type `fermentable` или `malt`;
- учитываются только строки, где normalized unit `g`;
- вес переводится в kg;
- `potentialPpg = getIngredientPotentialPpg(source.raw, 36)`;
- `colorLovibond = getIngredientColorLovibond(source.raw, 2)`.

`getIngredientPotentialPpg()` берет `fermentableExtractYieldPct` и считает:

```text
potentialPpg = fermentableExtractYieldPct * 0.46
```

Если данных нет — fallback `36`.

`getIngredientColorLovibond()` берет цвет из technical fields. Если данных нет — fallback `2`.

Hops:

- учитывается только type `hop`;
- учитываются только строки, где normalized unit `g`;
- `alphaAcidPercent = getIngredientAlphaAcidPercent(source.raw, 5)`;
- `use` для расчета: `dry_hop` остается `dry_hop`, `whirlpool` и `dip_hop` превращаются в `whirlpool`, все остальное — `boil`;
- время берется из `stepMeta.timeMinutes`, затем `timeOffset`, затем fallback: для boil — общее `boilTimeMinutes`, иначе `0`.

Важно: текущая функция `calculateIbuTinseth()` фильтрует hop additions и считает IBU только для `use === "boil"`. Whirlpool/dip hop/dry hop сейчас в IBU не добавляют вклад.

### OG

В `brewing-core/src/calculations/gravity.ts`:

```text
batchGallons = batchVolumeL * 0.2641720524
totalGravityPoints = sum(weightKg * 2.2046226218 * potentialPpg)
effectivePoints = totalGravityPoints * efficiency / 100
OG = 1 + effectivePoints / (batchGallons * 1000)
```

Результат округляется до 3 знаков.

### FG

Используется фиксированная аттенюация `DEFAULT_ATTENUATION = 75`, не аттенюация выбранных дрожжей:

```text
gravityPoints = (OG - 1) * 1000
remainingPoints = gravityPoints * (1 - 75 / 100)
FG = 1 + remainingPoints / 1000
```

Результат округляется до 3 знаков.

### ABV

```text
ABV = (OG - FG) * 131.25
```

Результат округляется до 2 знаков.

### IBU Tinseth

В `brewing-core/src/calculations/ibu.ts`:

```text
bignessFactor = 1.65 * 0.000125 ** (OG - 1)
boilTimeFactor = (1 - exp(-0.04 * boilTimeMinutes)) / 4.15
utilization = bignessFactor * boilTimeFactor
IBU addition = weightG * (alphaAcidPercent / 100) * utilization * 1000 / batchVolumeL
IBU = sum(boil additions)
```

Результат округляется до 1 знака.

### Цвет

В `brewing-core/src/calculations/color.ts`:

```text
volumeGal = batchVolumeL * 0.2641720524
MCU = sum((weightKg * 2.2046226218 * colorLovibond) / volumeGal)
SRM = 1.4922 * MCU ** 0.6859
EBC = SRM * 1.97
```

MCU округляется до 2 знаков, SRM/EBC — до 1 знака. В `recipes.color` сохраняется SRM.

### Когда расчет возвращает null

Если нет fermentables и hops, возвращаются `og`, `fg`, `abv`, `ibu`, `color` как `null`.

Если есть только хмель, но нет fermentables:

- OG `null`;
- IBU тоже `null`, потому что IBU считается только если есть OG;
- color `null`.

Если есть fermentables, но нет hops:

- OG/FG/ABV/color считаются;
- IBU `null`.

## 10. BJCP стиль и соответствие стилю

Стиль выбирается через `StylePicker` из `beerStyleFixtures` пакета `@nb/brewing-core`.

В live preview:

- `previewRecipeDraft()` берет style range через `getStyleRangeById(styleId)`;
- если есть хотя бы один показатель, вызывает `evaluateStyleFit(styleRange, { og, fg, abv, ibu, srm })`;
- UI показывает глобальную шкалу и диапазон выбранного BJCP стиля.

На публичной странице и в списке рецептов `RecipeStatsSummary` повторно оценивает соответствие стилю по сохраненным snapshot-показателям.

## 11. Публикация

Состояния:

- `private` — приватный рецепт, доступен владельцу в `/app`.
- `published` — публичный рецепт доступен по `/recipes/{slug}`.
- `draft` есть в enum/схеме, но мастер сейчас нормализует его в `private`.

Публиковать можно только уже созданный рецепт (`activeRecipeId` должен быть truthy). Для еще не сохраненного рецепта кнопка публикации не показывается.

Требования для `published` в `publication-validation.ts`:

- title непустой;
- выбран `styleId`;
- `description` непустой;
- есть хотя бы один `fermentable`;
- есть хотя бы один `hop`;
- есть хотя бы один `yeast`;
- `boilTimeMinutes` — положительное целое число.

Для `private` и `draft` требуется только title.

При клике `Опубликовать`:

- если checklist не готов, открывается `PublicationReadinessDialog`;
- если готов, открывается confirm dialog;
- confirm вызывает `persistRecipe({ nextPublicationState: "published" })`.

При клике `Сделать приватным`:

- открывается confirm dialog;
- confirm вызывает `persistRecipe({ nextPublicationState: "private" })`.

Публичная страница:

- `/recipes/[slug]` вызывает `getPublicRecipeBySlug(slug)`;
- сервис возвращает рецепт только если `publicationState === "published"`;
- `private`/`draft` дают `FORBIDDEN`, route показывает not found.

## 12. Версии, клонирование и удаление

### Версии

На edit-странице, если рецепт уже создан, показывается select версий и кнопка `Новая версия`.

`createRecipeVersion()`:

- проверяет владение текущим рецептом;
- находит все рецепты с тем же `recipeFamilyId`;
- `nextVersionNumber = max(versionNumber) + 1`;
- вызывает `createRecipe()` с тем же содержимым, `publicationState: "private"`, тем же `recipeFamilyId` и новым `versionNumber`;
- после успешного action UI редиректит на `/app/recipes/{newId}/edit`.

Перед созданием новой версии UI пытается сохранить текущие изменения.

### Клонирование

В списке рецептов есть `CloneRecipeButton`. Action `cloneRecipeAction()` вызывает `cloneRecipe()`:

- берет owned recipe;
- вызывает `createRecipe()` с title `${recipe.title} (копия)`;
- publication state всегда `private`;
- копирует стиль, batch size, efficiency, boil time, description, authorNotes, processMeta и ingredients;
- создает новое `recipeFamilyId`, потому что options не передаются.

### Удаление

`deleteRecipeAction()`:

- требует владение рецептом;
- удаляет строку из `recipes`;
- `recipe_ingredients` удаляются каскадом;
- revalidate делает для owner paths и публичной страницы, если slug был.

## 13. Отображение рецепта

### В списке `/app/recipes`

`listRecipesForAuthor()` возвращает рецепты автора, сортировка по `updatedAt desc`, лимит по умолчанию 50. Для каждой строки дополнительно считается `versionCount` по `recipeFamilyId`.

Карточка показывает:

- publication state label;
- updated label;
- title и version number, если версий больше одной;
- batch size и boil time;
- `RecipeStatsSummary`;
- ссылку на публичную страницу, если recipe `published`;
- кнопки delete/clone.

### На публичной странице

`PublicRecipePage` показывает:

- header;
- hero image placeholder или `heroImageId`;
- `RecipeStatsSummary`;
- `RecipeIngredientsSection`;
- `RecipeMetaSection` без приватных заметок.

`RecipeIngredientsSection` группирует ингредиенты по тем же категориям, показывает имя, secondary name, stage/use/time/temp/duration/stageLabel и форматированное количество.

## 14. Известные особенности текущей реализации

- UI мастера не использует состояние `draft`; новые и непубличные рецепты становятся `private`.
- `processMeta` сохраняется, но не влияет на расчеты.
- Yeast attenuation из каталога не влияет на FG; используется фиксированное `75%`.
- Water treatment и consumables сохраняются как позиции рецепта, но не влияют на расчет воды, pH или stats.
- Whirlpool/dip hop/dry hop сохраняются в рецепте, но IBU сейчас считает только boil additions.
- При сохранении ingredients заменяются полностью, поэтому id строк `recipe_ingredients` пересоздаются.
- `heroImageId` есть в модели, но полноценной загрузки/отображения изображения в мастере по текущему коду нет.
