# Редактор рецептов — Reference

> **Назначение:** детальная карта реализации редактора рецептов (recipe-designer) и связанного сервиса.
> **Источники истины (код):** `apps/web/components/recipes/recipe-designer.tsx`, `apps/web/features/recipes/service.ts`, `apps/web/features/recipes/contracts.ts`
> **Обновлено:** 2026-06-25
> **См. также:** [CONTEXT.md](../../CONTEXT.md), [water.md](water.md), [equipment.md](equipment.md)

---

## 1. Точки входа и архитектура компонентов

Маршруты:

- `/app/recipes` — список рецептов пользователя.
- `/app/recipes/new` — создание рецепта.
- `/app/recipes/[id]/edit` — редактирование.
- `/app/recipes/[id]` — legacy route, редиректит на `/edit`.
- `/app/equipment` — профили оборудования (см. [equipment.md](equipment.md)).
- `/recipes/[slug]` — публичная страница опубликованного рецепта.

Цепочка компонентов:

```
RecipeEditorPage (recipe-editor-page.tsx)   — server/page wrapper, держит save status / publication chrome
  └─ RecipeForm (recipe-form.tsx)            — тонкий прокси props
       └─ RecipeDesigner (recipe-designer.tsx) — основной клиентский редактор (export на ~стр. 4778)
```

Весь основной UX живёт в `RecipeDesigner`. `RecipeForm` и `RecipeEditorPage` — тонкие обёртки.

Вспомогательные компоненты:

- `recipe-actions-menu.tsx` — компактные header actions: импорт/экспорт и старт варки.
- `bitterness-settings-drawer.tsx` — настройки расчёта IBU (кнопка `⚙` рядом с IBU).
- `recipe-water-additives-section.tsx` — read-only список рассчитанных солей/кислот; `water-setup-wizard.tsx`, `water-summary-card.tsx` — guided flow по воде (детали в [water.md](water.md)).
- `ingredient-add-drawer.tsx`, `stock-ingredient-list.tsx` — drawer добавления ингредиента и список склада.
- `stock-coverage-summary.tsx` — компактная сводка покрытия складом.
- `import-export-modal.tsx` — modal wizard для BeerXML/Brewfather import/export.
- `brew-picker-dialog.tsx` (`components/recipes/`) — единая точка входа «Сварить»: виртуальная партия (без клона рецепта) либо выбор устройства BrewForge (`features/devices/components/device-picker-list.tsx`, `brew-recipe-on-device-picker.tsx`).
- `recipe-images-section.tsx` — редактор `Фото пива`.

### Информационная ось страницы

1. Header: название, BJCP style picker, publication controls, compact actions `Импорт / экспорт` и `Начать варку`. Save status показывается обёрткой.
2. `Параметры партии` (левый блок) + `Расчёт показателей` (правый блок live preview).
3. Core ingredient sections: `Сбраживаемое`, `Хмель`, `Дрожжи`, `Другие добавки`.
4. Process profiles: `Mash Profile`, `Fermentation Profile`.
5. Advanced lower area: `Вода`, `Покрытие складом`.
6. Bottom: `Фото пива`, `Описание рецепта`, `Личные заметки`.

С основной оси убраны крупные блоки `Расчёт горечи`, textarea import/export, отдельный brew mode и равноправная ingredient-секция `Водоподготовка`.

> Примечание: отдельного равноправного блока `Оборудование` в редакторе нет — профиль выбирается select-ом внутри `Параметры партии` (см. §6 и [equipment.md](equipment.md)).

---

## 2. Autosave, live preview и publication flow

### Autosave

1. Любое изменение state меняет `currentSignature`.
2. Через `setTimeout` **1500 мс** вызывается `persistRecipe()`.
3. Новый рецепт → `createRecipeAction()`; существующий → `updateRecipeAction(activeRecipeId, …)`.
4. После первого create заполняется `activeRecipeId`, URL тихо переключается на `/app/recipes/{id}/edit` через `history.replaceState` без reload.
5. `persistRecipe()` сначала прогоняет `buildAutosaveBlockedResult` (Zod-схема + publication field errors): если форма невалидна, save блокируется и подсвечиваются поля.
6. Блок `Фото пива` использует тот же принцип: при отсутствии recipe id перед первым upload тихо создаётся private draft.

### Live preview

1. Через `setTimeout` **400 мс** вызывается `previewRecipeDraftAction(savePayload)`.
2. Preview обновляет OG/FG/ABV/IBU/color/style fit независимо от autosave.
3. FG подаётся спокойно: helper только когда расчёта нет (`Добавьте сбраживаемое`), source-label только для отдельных режимов.
4. Если выбран BJCP style, preview показывает `В стиле` / `Отклонения`.

### Publication

- `Опубликовать` видна только для уже созданного private recipe; checklist не готов → readiness dialog, готов → confirm dialog (`publicationState = "published"`). `Сделать приватным` — отдельный confirm.
- Checklist для публикации (`publicationValidation.publicationRequirementKeys.published`):
  - `title`;
  - `description`;
  - хотя бы одно `fermentable`;
  - хотя бы один `hop`;
  - хотя бы одни `yeast`;
  - `boilTimeMinutes`.

> **Исправлено относительно старого описания:** BJCP `styleId` **не входит** в обязательный publication checklist (в коде `publicationRequirementKeys.published` его нет). `draft`/`private` требуют только `title`.

---

## 3. Реализованные фичи (карта PR-плана)

- **Структура данных v1.5:** поля в `recipes` / `recipe_ingredients`, стабильный `recipe_ingredients.persistentKey`, `syncRecipeIngredients()` вместо delete-all/insert-all, `equipment_profiles`, выбор профиля в редакторе, практическое масштабирование под профиль.
- **IBU-модель:** `tinseth_whirlpool_v2` (default) + `tinseth_classic`, `rager`, `garetz`, `noonan_legacy`; gravity at time of addition; whirlpool/hopstand temperature factor; optional late hop carryover; dry hop вне standard IBU total; first wort hop modes (см. §5).
- **Вода:** practical-калькулятор source→target→additions, salt solver, mash pH estimate, mash/sparge acid estimate. Соли/кислоты теперь показываются read-only в списке добавок. Детали — [water.md](water.md).
- **Источники ингредиента:** `Из склада` / `Из каталога` / `Создать свой`; stock suggestions через inventory runtime; allocations/reserve/consume/release; confirmed consume пишет `inventory_transactions`; autosave не списывает склад (см. §7).
- **Import/export:** modal wizard, BeerXML import/export, Brewfather JSON import (тестовая поддержка), canonical mapping на сервисном уровне, импортированные строки как recipe-local snapshot (см. §6).
- **Начать варку:** создание `brew_batches` со snapshot brew plan; опциональное списание склада перед созданием (см. §8).

---

## 4. Модель данных

### `recipes`

`publicationState`, `title`, `slug`, `styleId`, batch entered/normalized quantity/unit, `efficiency`, `boilTimeMinutes`, calculated `og`/`fg`/`abv`/`ibu`/`color`, `description`, `authorNotes`, `heroImageId`, `processMeta`, `calculationMeta`, `draftState`, `importMeta`, `equipmentProfileId`, `equipmentProfileSnapshot`, `waterPlanMeta`, `brewPlanMeta`.

`RecipeDetailDto` дополнительно выносит `fgEstimateMode` / `fgEstimateDetails` наверх (зеркало из `calculationMeta`).

### `recipe_ingredients`

`persistentKey`, `displayOrder`, source linkage (catalog ingredient **или** user custom ingredient; для imported snapshot допустим recipe-local режим без обоих), taxonomy + display snapshots, entered/normalized amount, `stage`, `timeOffset`, `stepMeta`, `inventoryIntentMode`, `inventorySelectionMeta`, `externalImportMeta` (для imported lines содержит `externalImportMeta.importedIngredient`).

`recipeInventoryIntentModes = ["none", "use_stock", "catalog", "custom", "imported"]`.

Сохранение — `syncRecipeIngredients()` (`service.ts`):

- match по `persistentKey` (отсутствующий генерируется через `crypto.randomUUID()`);
- update существующих строк, insert новых, delete строк не из payload.

Валидация (`recipeIngredientPayloadSchema`): для `imported` обе source id должны быть пусты; иначе ровно один из catalog/custom; category/subtype/type согласуются через `resolveIngredientCategory`/`resolveIngredientSubtype`/`resolveLegacyIngredientType`.

### `recipe_images`

Object storage + metadata-модель `recipe_images`: `recipeId`, storage keys (`original`/`large`/`medium`/`thumb`), размеры, `mimeType`, `sizeBytes`, optional `blurDataUrl`/`caption`/`altText`, `sortOrder`, `isCover`, `status` (`uploading|ready|failed`), timestamps + soft delete `deletedAt`. См. §9.

### Inventory / batches

`recipe_inventory_allocations`, `inventory_transactions`, `brew_batches`, `equipment_profiles`. Опциональные водные данные — в `waterPlanMeta`.

---

## 5. Расчёты: OG / FG / ABV / IBU / Color

Все статы считаются в `computeRecipeStatsSnapshot()` (`service.ts`), который вызывается из `recomputeRecipeStats()` (persist) и из `previewRecipeDraft()` (live preview). Стат-снапшот использует: batch volume, efficiency, boil time, `calculationMeta`, `processMeta`, hydrated ingredients с technical data.

Базовые правила и fallback-и:

- batch volume берётся из `batchSizeNormalizedQuantity` (через `toBatchVolumeLiters`), efficiency fallback = `DEFAULT_EFFICIENCY`.
- **Fermentables** учитываются только в единицах `g` (вес → кг); `potentialPpg` fallback `36`, `colorLovibond` fallback `2`.
- **Hops** учитываются только в `g`; `alphaAcidPercent` fallback `5`; время — `resolveHopTimeMinutes` (из `stepMeta.timeMinutes`/`timeOffset`/boil fallback); use type — `resolveHopUseType(stage, stepMeta)`.
- Если нет ни fermentables, ни hops — все статы `null`.

Формулы (из `@nb/brewing-core`):

| Стат | Источник |
|------|----------|
| OG | `calculateOg({ fermentables, batchVolumeL, brewhouseEfficiencyPercent })` |
| FG | `calculateRecipeFgEstimate(...)` → `predictedFg` (см. §5.1) |
| ABV | `calculateAbv(og, fg)` (только если есть og и fg) |
| IBU | `calculateBitterness(...)` (только если есть hops и og) |
| Color | `calculateColor(fermentables, batchVolumeL).srm` |

Color → EBC для отображения через `srmToEbc`; hex-цвет/градиент по SRM — `beer-color.ts` (`beerColorFromSrm`, `srmToHex`, `srmToSoftGradient`).

> **Ограничение (проверено по коду):** в `computeRecipeStatsSnapshot` при вызове `calculateBitterness` параметры `hopUtilizationFactor` и `altitudeM` **захардкожены** (`1` и `0`), а `preBoilVolumeL = null`, `postBoilVolumeL = batchVolumeL`. То есть equipment `hopUtilizationFactor`, высота над уровнем моря и kettle gravity curve из equipment volume plan в фактический расчёт IBU не входят. `equipmentProfileSnapshot` передаётся в функцию, но в OG/IBU/color напрямую не используется — оборудование влияет на расчёт лишь косвенно (через recipe-level объём/эффективность). Это расходится с более ранними описаниями «equipment hop utilization factor» / «kettle gravity curve от equipment volumes».

### Палитра цвета (`beer-color.ts`)

`SRM_COLOR_MAP` (порог `maxSrm` → hex/label), при превышении — `DARKEST` (`#1A0F0B`, «Чёрный»). Текст светлый при `srm >= 12`. Дополнительно: `srmToSoftGradient`, `srmColorBands` (7 сегментов для фильтра цвета на витрине `/recipes`).

### 5.1. FG-модель (`fg-estimate.ts`)

FG — **прогноз**, не лабораторная плотность. `calculateRecipeFgEstimate` возвращает `{ predictedFg, fgEstimateMode, fgEstimateDetails }`.

Режимы (`recipeFgEstimateModes`): `unavailable`, `default_estimate`, `yeast_estimate`, `manual_attenuation_override`, `manual_fg_override`.

Порядок:

1. Нет fermentables или `og == null` → `unavailable`, FG `null`.
2. `manualFgOverrideValue` задан → `manual_fg_override`, FG = это число (наивысший приоритет).
3. Иначе base attenuation:
   `manualAttenuationOverridePct ?? yeast.midpoint ?? yeast.single ?? 75`
   (`DEFAULT_ATTENUATION_PCT = 75`; yeast midpoint = `(min+max)/2`).
4. Главная mash-пауза (`resolveMainMashStep`): самый длинный шаг в диапазоне `62–70°C`, иначе самый длинный из всех. Корректировка:
   `mashAdjPctPoints = clamp((67 − mainMashTempC) * 0.75, −4, 4)`.
5. Grist-корректировки по доле gravity points (классификация по имени/technicalData):
   - simple sugars: `simpleSugarAdj = min(share% * 0.20, 3)`;
   - crystal / caramel / dextrin: `crystalDextrinAdj = min(share% * 0.10, 2.5)`;
   - lactose / maltodextrin: `lactoseAdj = min(share% * 0.35, 4)`.
6. `effectiveAttenuationPct = clamp(base + mashAdj + simpleSugarAdj − crystalDextrinAdj − lactoseAdj, 60, 90)`.
7. `predictedFg = calculateFg({ og, attenuationPercent: effectiveAttenuationPct })`.

Внутренний FG range (для снижения ложной точности, не показывается в шапке):

- `default_estimate` — по диапазону `72–78%` (+ те же grist/mash корректировки);
- `yeast_estimate` с min/max attenuation — по min/max;
- при manual FG override range не считается.

UI source-label (`resolveRecipeFgSourceLabel`): `manual_fg_override`→`Ручной FG`, `manual_attenuation_override`→`Ручная attenuation`, `default_estimate`→`Прогноз по умолчанию`, иначе (`yeast_estimate`) — **без подписи** (`null`). Helper (`resolveRecipeFgHelperText`): `Добавьте сбраживаемое` только при `unavailable`/FG `null`.

UI-контролы FG спрятаны под `⚙`/info-иконкой в карточке FG: `Ожидаемая attenuation, %` (range 60–90) и advanced `Зафиксировать КП вручную`; technical breakdown — под `Показать детали расчёта`.

---

## 6. Настройки горечи / IBU-модель

Drawer `Настройки расчёта горечи` открывается по `⚙` рядом с IBU (`bitterness-settings-drawer.tsx`). Поля и дефолты (`recipeCalculationMetaSchema.bitternessSettings`):

| Поле | Default |
|------|---------|
| `bitternessFormula` | `tinseth_whirlpool_v2` |
| `includeBoilCarryoverIntoWhirlpool` (carryover позднего хмеля) | `true` |
| `whirlpoolUtilizationFactor` | `1` (max 3) |
| `hopFormUtilizationFactor` | `1` (max 3) |
| `firstWortHopMode` | `bonus_10pct` (или `treat_as_20min` / `treat_as_boil_start`) |

Формулы (`recipeBitternessFormulas` / `recipeBitternessFormulaLabels`): `tinseth_whirlpool_v2`, `tinseth_classic`, `rager`, `garetz`, `noonan_legacy`.

Хмель в секции группируется по use type (`recipeHopUseTypes`): `boil`, `first_wort_hop`, `whirlpool` (Whirlpool/Hopstand), `dry_hop`, `dip_hop`, `other`. Whirlpool/dip hop вносят temperature factor через `whirlpoolTimeMinutes`/`whirlpoolTemperatureC`; dry hop в standard IBU total не учитывается.

---

## 7. Core ingredient flow и склад

Категории (`recipeIngredientCategoryOptions`): `fermentable` (Сбраживаемое), `hop` (Хмель), `yeast` (Дрожжи), `water_treatment` (Водоподготовка), `consumable` (Другие добавки).

Add flow (drawer): `+ Добавить` → выбор пути `Из склада` / `Из каталога` / `Создать свой`.

- `Из склада`: предзагруженный список stock positions по категории, search вторичен. При выборе: `inventoryIntentMode = "use_stock"`, `inventorySelectionMeta.inventoryItemId` хранит source stock item; autosave сохраняет только recipe line, склад **не** списывается.
- `Из каталога`: общий ingredient picker/search.
- `Создать свой`: custom ingredient через recipe action.

Позиция валидна, когда выбран catalog/custom source и количество > 0. Импортированная строка: `inventoryIntentMode = "imported"`, оба source id пусты, ингредиент в `externalImportMeta.importedIngredient`; в списке показывает бейдж `Импортировано` и действия `Сохранить как свой` / `Подобрать из каталога`.

`Другие добавки` = складская группа `consumable` + `inventory_additives` (seed `additives_v2_1.json`): фининги, ферменты, нутриенты, лузга, специи, цедра, травы/цветы, кофе/какао, дерево, ароматизаторы. Складские `Расходники` (`inventory_supplies`) в рецепт не добавляются.

Водные соли/кислоты остаются внутри блока `Вода` и теперь показываются read-only в списке добавок через `RecipeWaterAdditivesSection`.

> **Исправлено:** поле `waterPlanMeta.showWaterAdditivesInIngredients` помечено `@deprecated` (соли/кислоты всегда показываются read-only); поле сохранено в схеме только для обратной совместимости. Это отменяет более раннее описание «mirroring сведён к сохранению preference».

### Покрытие складом

Компактный summary `Покрытие складом` ниже advanced area: число связанных со складом ингредиентов, хватает ли на варку, число shortage-позиций. Действия `Проверить покрытие` / `Списать на варку`. Принцип: autosave не списывает; confirmed consume — только по явному действию, пишет `inventory_transactions` и уменьшает normalized stock quantity.

---

## 8. Import / export (BeerXML / Brewfather)

Header action `Импорт / экспорт` открывает `ImportExportModal`.

### Import

Flow: `Что хотите сделать?` → `Импортировать рецепт`; формат `BeerXML` или `Импорт из Brewfather (тестовая поддержка)`; вставка текста или загрузка файла (`.xml`/`.beerxml` или `.json`); `Импортировать` → action создаёт private recipe → редирект на edit page.

Перед импортом модал показывает **сводку** (`buildImportRecipeSummary` → `ImportSummaryCard`): название, число и breakdown по категориям, параметры (объём/кипячение/эффективность), показатели из файла, число mash-шагов, превью первых 6 позиций. Парсинг — `importBeerXmlToCanonicalRecipe` / `importBrewfatherJsonToCanonicalRecipe` → `CanonicalRecipe`.

Import mapping (canonical, сервисный уровень):

- BeerXML `<FERMENTABLE><COLOR>` Lovibond → EBC; `<YIELD>` → extract yield;
- hop `ALPHA`/`alpha` → AA%; hop form (`Pellet`/`Leaf`/`Cryo`…) → snapshot technical data;
- yeast attenuation/form → snapshot technical data;
- BeerXML `<MASH_STEP>` и Brewfather `mash.steps` → `processMeta.mashProfile.steps`;
- BeerXML `IBU_METHOD` → `calculationMeta.bitternessFormula` (fallback `tinseth_whirlpool_v2`);
- recipe stats из файла → `importMeta.importedStats` (аудит);
- MISC → consumable/water-treatment taxonomy.

Import service **не** создаёт custom ingredients автоматически. Каждая строка — recipe-local snapshot: `ingredientCatalogItemId = null`, `userCustomIngredientId = null`, `inventoryIntentMode = "imported"`, `externalImportMeta.importedIngredient` (имя, taxonomy, default/allowed units, measurement dimension, technical data). Перенос в custom или подбор из каталога — только явным действием на карточке строки.

### Export

Flow: `Экспортировать рецепт` → формат всегда `BeerXML` (форсится в модале) → `Экспортировать BeerXML` (сначала сохраняет рецепт через `exportRecipeBeerXmlAction`) → результат в textarea, `Копировать` / `Скачать` (`recipe.beerxml`).

Export mapping:

- recipe-level: `OG`, `FG`, `IBU`, `IBU_METHOD`, `COLOR`, `ABV`, `BATCH_SIZE`, `BOIL_TIME`, `EFFICIENCY`, `TYPE`, `NOTES`;
- `FERMENTABLES`: `TYPE`, `AMOUNT` (кг), `YIELD`, `COLOR` (Lovibond), `ADD_AFTER_BOIL`;
- `HOPS`: `ALPHA`, `AMOUNT` (кг), `USE`, `TIME`, `FORM`;
- `YEASTS`: `FORM`, `AMOUNT`, `AMOUNT_IS_WEIGHT`, `ATTENUATION`;
- `MISCS` (consumables + water treatment): `TYPE`, `USE`, `TIME`, `AMOUNT`, `AMOUNT_IS_WEIGHT`;
- `MASH/MASH_STEPS` из `processMeta.mashProfile.steps`: `STEP_TEMP`, `STEP_TIME`.

> **Ограничения:** `BOIL_SIZE` не экспортируется из equipment volume plan; полноценного post-import report screen нет (есть только pre-import сводка).

---

## 9. Process profiles

`processMeta` сохраняется в рецепте (`recipeProcessMetaSchema`).

- **Mash Profile** (`mashProfile.steps`): список шагов (имя, температура 0–100°C, длительность 1–600 мин, max 10 шагов). По умолчанию шагов нет (`steps: []`). Участвует в FG через выбор главной паузы (§5.1).
- **Fermentation Profile**: `primaryTemperatureC` (default 20), `primaryDurationDays` (default 10), `extraSteps` (max 10), `coldCrash` (default 2°C/2 дня, off), `conditioning` (default 12°C/14 дней, off). Сохраняется как process plan, но **не** является драйвером OG/FG/ABV/IBU/color.

---

## 10. Старт варки (batches)

Header action `Начать варку` открывает единую точку входа `BrewPickerDialog` (`components/recipes/brew-picker-dialog.tsx`): виртуальная партия без клонирования рецепта либо выбор устройства для варки на BrewForge (`device-picker-list.tsx` / `brew-recipe-on-device-picker.tsx` → `features/brew-controller/brew-recipe-flow.ts`). Для виртуальной партии — сохранение рецепта → `createBrewBatchFromRecipeAction(recipeId)`.

`createBrewBatchFromRecipe` (`features/brew-batches/service.ts`) создаёт batch со `status = "planned"` и snapshot `buildBrewPlanSnapshot(recipe)`.

`BrewPlanSnapshot` (`brewPlanSnapshotSchema`, `version: "brew_plan_v1"`): `recipe` (id/title/versionNumber/batchSizeL), `equipmentProfileSnapshot`, `waterPlanMeta`, `mashSteps`, `boilPlan` (`boilTimeMinutes` + `timedAdditions`), `whirlpoolPlan`, `fermentationPlan`, `packagingPlan`, `deviceHints`.

`brewBatchStatuses = ["planned", "brewing", "fermenting", "completed", "cancelled"]`. `updateBrewBatchStatus` проставляет `startedAt` при `brewing` и `completedAt` при `completed`.

> **Ограничение:** пошаговый brew session UI и live device control не реализованы (`deviceHints` собирается, но не используется в UI).

---

## 11. Фото пива (загрузка изображений)

Блок `Фото пива` (`recipe-images-section.tsx`) — secondary editor в нижней области.

Лимиты (`features/recipe-images/contracts.ts`): `RECIPE_IMAGE_MAX_COUNT = 8`, `RECIPE_IMAGE_MAX_FILE_BYTES = 10 МБ`, `RECIPE_IMAGE_MAX_TOTAL_BYTES = 40 МБ`. Превышение показывается на уровне блока, а не как набор failed-карточек.

UX: empty state `Загрузить фото`; quiet drag-and-drop, primary action — кнопка; cover без crop; desktop — большая cover + вертикальная лента thumbnail, mobile — горизонтальная лента; lightbox по клику; reorder через `dnd-kit`; `Сделать обложкой` / `Удалить` / `Повторить`; progress per file; partial failures не ломают остальные.

Cover: живёт в `recipe_images.isCover`, `recipes.heroImageId` синхронизируется с текущей ready cover; одновременно одна cover; при удалении/fail cover переходит к первой ready image. First upload умеет работать через silent draft creation.

Storage pipeline: EXIF autorotate, strip metadata/geodata, генерация `original`/`large`/`medium`/`thumb` (grid — `thumb`, lightbox — `medium`/`large`); upload route валидирует MIME/size до создания draft/slot; принимаются только raster `jpeg/png/webp` (spoofed SVG отвергаются); local storage key проверяется на path traversal, ответы с `nosniff`.

Не реализовано в v1: публичная gallery на public recipe page, caption/alt editor в основном UX, видео/HEIC/GIF.

---

## 12. Публичное отображение (кратко)

Public route отдаёт только `publicationState === "published"`: header, stats summary, ingredient sections, public description. Private notes не показываются. Image model (`sortOrder`/`isCover`) готова к будущей public gallery, но отдельная gallery layout не реализована.

`RecipeMethod` (`all_grain`/`biab`/`extract`) нигде не персистится (нет колонки/поля в `processMeta`) — в карточках `method = null`, фильтр по методу не применяется.

---

## 13. Тестовое покрытие

`recipe-service.test.ts`, `recipe-editor-components.test.ts`, `recipe-editor-pages-wiring.test.ts`, `equipment-profile-volume-plan.test.ts`, `equipment-profiles-page.test.ts`, `recipe-water-plan.test.ts`, `recipe-inventory-service.test.ts`, `recipe-interop.test.ts`, плюс brewing-core IBU/water тесты.

---

## 14. Известные ограничения

- FG — practical estimate, не лабораторная модель брожения; фактическая FG может заметно отличаться.
- Fermentation temperature/profile не используется как драйвер FG; equipment влияет на FG лишь косвенно (через объём/OG).
- Ingredient-level fermentability ограничена эвристиками sugar / crystal / lactose (по имени + technicalData).
- Alcohol tolerance / stressed fermentation / high-gravity guardrails отсутствуют.
- IBU: equipment `hopUtilizationFactor`, altitude и kettle gravity curve из equipment volume plan в `computeRecipeStatsSnapshot` **не применяются** (захардкожены `1`/`0`).
- Scaling под оборудование — practical approximation, не IBU-preserving optimizer.
- Water pH/acid — practical estimate; city water presets — примеры, не lab-grade (детали в [water.md](water.md)).
- Imported ingredient snapshot привязывается к custom/catalog вручную; batch-matching с каталогом нет; полноценного post-import report нет.
- Brew session UI не пошаговый; live device control не реализован.
- Публичная recipe gallery не реализована (image model/storage pipeline готовы).
- `waterPlanMeta.showWaterAdditivesInIngredients` deprecated (соли/кислоты всегда read-only в списке).
