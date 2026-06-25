# Водоподготовка — Reference

> **Назначение:** единый справочник по water-flow и расчётам водоподготовки (профили, соли, кислоты, mash pH).
> **Источники истины (код):** `apps/web/features/recipes/water-plan.ts`, `apps/web/features/recipes/water-*.ts`, `packages/brewing-core/src/water.ts`
> **Обновлено:** 2026-06-25
> **См. также:** [CONTEXT.md](../../CONTEXT.md), [recipes-editor.md](recipes-editor.md), [equipment.md](equipment.md)

---

## Карта кода

Истина здесь не markdown, а runtime. Главные файлы:

| Файл | Роль |
| --- | --- |
| `apps/web/components/recipes/recipe-designer.tsx` | Собирает входные данные и рендерит секцию `Водоподготовка`. |
| `apps/web/components/recipes/water-setup-wizard.tsx` | UI настройки source/target/split/pH и расчётного предложения. |
| `apps/web/components/recipes/recipe-water-additives-section.tsx` | Фактические добавки воды + проверка склада. |
| `apps/web/features/recipes/water-plan.ts` | Рецептный расчёт: volume plan, salt plan, pH, acid plan. |
| `apps/web/features/recipes/water-profile-presets.ts` (реэкспорт `water-profiles.ts`) | Built-in source/target профили. |
| `apps/web/features/recipes/water-target-profiles.ts` | Каталог целевых профилей воды + поиск + BJCP-маппинги. |
| `apps/web/features/recipes/water-additives-catalog.ts` | Маппинг расчётных солей/кислот на catalog ids. |
| `apps/web/features/recipes/water-additives-service.ts` | Проверка наличия рассчитанных добавок на складе. |
| `apps/web/features/equipment-profiles/volume-plan.ts` | Расчёт общего объёма воды от профиля оборудования. |
| `packages/brewing-core/src/calculations/water.ts` | Низкоуровневые формулы: соли, solver, pH, кислота. |

> Примечание: фактический путь к низкоуровневым формулам — `packages/brewing-core/src/calculations/water.ts` (в шапке указан как `packages/brewing-core/src/water.ts`).

---

## Обзор / состояние

Блок `Водоподготовка` состоит из трёх разных сущностей:

1. **Расчёт воды (preview).** Берётся из `waterPlanMeta` и `buildRecipeWaterPlanResult()`, показывается внутри `WaterSetupWizard` (блок `Расчёт`). Не попадает в рецепт без действия пользователя.
2. **Список добавок воды.** Показывается в `RecipeWaterAdditivesSection`. Технически соли хранятся в `waterPlanMeta.manualSaltAdditions` при `engine = "advanced_manual"`, но UI не называет это отдельным режимом.
3. **Обычные ингредиенты категории `water_treatment`.** Пользователь может добавить их вручную как ингредиенты рецепта. Видны в той же секции, но сами по себе не управляют химическим расчётом воды.

В `RecipeDesigner` секция рендерится среди ингредиентов (после `Дрожжи`, перед `Другие добавки`). Порядок внутри секции:

1. `RecipeWaterAdditivesSection` — фактические добавки воды.
2. Legacy/manual `recipe_ingredients` категории `water_treatment`, если есть.
3. Embedded `WaterSetupWizard` — настройка source/target/объёмов/pH и расчётное предложение.

В header секции: заголовок `Водоподготовка`, счётчик фактических добавок, кнопка `Настроить воду` / `Скрыть настройку`, и кнопка `Сбросить воду` (только если `setupEnabled === true`). Отдельного wizard-screen и явного переключателя «вкл/выкл» нет.

### persisted vs effective

Компонент различает два состояния:

- **persisted state** — `waterPlanMeta` (сохраняется в `recipes.water_plan_meta`).
- **display/effective state** — если `setupEnabled === false`, wizard всё равно строит стартовую конфигурацию для редактирования через `ensureRecipeWaterPlanConfigured(waterPlanMeta)`:

```ts
const effectiveWaterPlanMeta =
  waterPlanMeta.setupEnabled
    ? waterPlanMeta
    : ensureRecipeWaterPlanConfigured(waterPlanMeta);
```

UX-следствия:

- даже пока вода «не включена», UI показывает подготовленный стартовый source (визуальный fallback — `Осмос`) и даёт редактировать source/target;
- шаги `3. Объём воды`, `4. pH и подкисление`, блок `Расчёт` и `Расширенные настройки` скрыты, пока пользователь не совершит первое meaningful action;
- вода считается настроенной (`setupEnabled = true`) только после первого `onChange`.

**Активирующие действия (шаг 1 или 2):** выбор source preset; выбор saved source profile; ручное редактирование source ions; выбор target из поиска; выбор saved target profile; ручное редактирование target ions.

Выбор BJCP-стиля сам по себе **не** активирует setup и не сохраняет target: mount/render wizard не вызывает `onChange`.

### Сброс

`createRecipeWaterPlanResetMeta()` (кнопка `Сбросить воду`) полностью чистит state: `setupEnabled = false`; обнуляет source/target профили и их id/slug/source-маркеры; `mash/sparge/totalWaterVolumeL = null`; `manualSaltAdditions = []`; `spargeAcidificationEnabled = false`; `showWaterAdditivesInIngredients = false`; `acidConcentrationPct = null`; `calibrationOffset = null`; и возвращает дефолты `targetMashPh = 5.35`, `selectedAcid = "lactic_acid"`, `phModel = "hybrid_mash_ph_v1"`. После reset UI снова показывает effective display state с `Осмос`.

### Что хранится в `waterPlanMeta`

| Поле | Назначение |
| --- | --- |
| `setupEnabled` | Включена ли фактическая настройка воды. |
| `engine` | `profile_only`, `balanced_default`, `advanced_manual`. |
| `phModel` | `kolbach_ra_quick` или `hybrid_mash_ph_v1`. |
| `sourceProfile*` | Режим, id/name и ионы исходной воды. |
| `targetProfile*` | Режим, slug/name/source и ионы целевого профиля. |
| `mashWaterVolumeL`, `spargeWaterVolumeL` | Ручной split на затор/промывку. |
| `totalWaterVolumeL` | Legacy override общего объёма. В UI сейчас почти не выставляется, но расчёт поддерживает. |
| `grainAbsorptionLPerKg` | Override поглощения воды дробиной. |
| `allowedSalts` | Явный набор солей для auto solver. Обычно пустой. |
| `manualSaltAdditions` | Ручные соли для `advanced_manual`. |
| `targetMashPh` | Целевой pH затора. `null` отключает расчёт pH затора. |
| `spargeAcidificationEnabled` | Включено ли подкисление промывки. |
| `spargeSourcePh`, `targetSpargePh`, `targetSpargeAlkalinity` | Входы для кислоты в промывку. |
| `selectedAcid`, `acidConcentrationPct` | Кислота и её концентрация. |
| `calibrationOffset` | Ручная поправка к pH-модели. |

`blendRatio` и `showWaterAdditivesInIngredients` остаются в схеме для совместимости, но текущий расчёт их не использует. `showWaterAdditivesInIngredients` помечен как deprecated.

`waterPlanResult` (`RecipeWaterPlanResult`) **не хранится в БД** — пересчитывается на лету при рендере редактора и публичной страницы. При создании партии `brew_batches.water_plan_snapshot` получает `recipe.waterPlanMeta`, а не рассчитанный `waterPlanResult`.

---

## Профили (source / target)

`WaterProfile` содержит ppm-ионы и опциональный pH:

```ts
{ ca, mg, na, cl, so4, hco3, ph }
```

`ph` допускается, но большинство расчётов минерализации работают только с ионами.

### Source (исходная вода)

Built-in source presets (`builtInSourceWaterProfiles`):

| Preset id | name | profile (Ca/Mg/Na/Cl/SO4/HCO3/pH) | Показывается в UI |
| --- | --- | --- | --- |
| `ro_distilled` | `Осмос` | `1 / 0 / 8 / 4 / 1 / 16 / 7` | да |
| `distilled_water` | `Дистиллированная вода` | `0 / 0 / 0 / 0 / 0 / 0 / 7` | да |
| `pilsen_example` | `Pilsen` | `7 / 3 / 2 / 5 / 5 / 25` | нет (historical) |
| `dublin_example` | `Dublin` | `110 / 4 / 12 / 19 / 53 / 280` | нет (historical) |
| `munich_example` | `Munich` | `82 / 20 / 4 / 2 / 16 / 320` | нет (historical) |

Source UI в текущем рендере показывает только: `Осмос`, `Дистиллированная вода`, `Вручную`, плюс dropdown `Сохранённый профиль` (если есть saved). Исторические `Pilsen / Dublin / Munich` есть в данных, но не рендерятся (остаются для совместимости старых `waterPlanMeta`).

Нюанс: `Осмос` — не буквально нулевой профиль, но runtime считает его допустимым low/zero-mineral source и не поднимает `source_profile_missing_or_zero`.

Source ion editor всегда виден под кнопками режимов. Поля: `Ca`, `Mg`, `Na`, `Cl`, `SO4`, `HCO3` (поля pH у source в шаге нет). Любое изменение любого ion-поля немедленно переводит source в `manual` mode и очищает `sourceProfilePresetId`/`sourceProfileSavedId`.

Кнопка `Вручную` не создаёт пустой профиль: `setRecipeWaterManualSourceProfile(...)` берёт текущий профиль (осмос или saved) и переводит его в manual, то есть «форкает» preset.

### Target (целевой профиль)

Target берётся из:

- каталога `ingredients/new/water_target_profiles_seed_v4_audited.json` через `water-target-profiles.ts`;
- saved target profiles из `localStorage`;
- ручного ввода.

Target UI: `Подобрать профиль`, `Вручную`, плюс dropdown saved (если есть). После выбора из поиска: mode = `catalog`, `targetProfile` копируется, `targetProfileSource = "user_catalog"`, `targetProfileIsOverridden = true`, `targetProfileResolvedFromBjcpStyleKey = current style key`.

`targetProfileSource` enum (`contracts.ts`): `auto_style`, `user_catalog`, `user_saved`, `manual`. Авто-подсказка по стилю маркируется `auto_style` (не overridden); явный выбор/ручной ввод → `user_catalog` / `user_saved` / `manual` (overridden).

Если у рецепта есть `styleId` и для него находится BJCP mapping, wizard использует его только для списка подсказок в picker — без авто-применения и без активации setup. `autoSelectDefault` в seed читается, но actual auto-select effect runtime не делает.

Built-in target профили (`builtInTargetWaterProfiles`) остаются в коде для compatibility/older flows: `balanced`, `neipa`, `west_coast_ipa`, `pilsner`, `helles`, `dubbel`, `stout`, `light_malty`, `light_hoppy`. В текущем picker не используются (picker берёт каталог из seed).

### Каталог целевых профилей и поиск

Каталог строится из seed `water_target_profiles_seed_v4_audited.json`.

Текущее покрытие (coverage_summary):

- `37` профилей (из них 35 calculator-ready, 2 contextual);
- `128` BJCP style mappings (`bjcp_style_defaults`);
- `9` quick-pick профилей.

Поведение picker без поискового запроса:

- **Сценарий A (есть style default):** suggested cards — default + до 3 alternatives, badge `Подходит по стилю`.
- **Сценарий B (style default нет):** quick picks — первые 6 из `getWaterTargetQuickPickProfiles(6)`, badge `Быстрый выбор`.

Под suggested cards идёт остальной каталог (без already-featured slugs). При непустом query suggested cards исчезают, показываются только search results; пусто → `Ничего не найдено`.

Нормализация поиска: `NFKD` → удаление диакритики → `ё → е` → lower-case → punctuation/разделители в пробел.

Search fields, веса и scoring:

| Уровень | Поля | Weight |
| --- | --- | --- |
| `high` | имя, русское имя, slug, profile aliases | `700` |
| `medium` | intent / style family aliases | `420` |
| `low` | source aliases, description | `160` |

| Match | Score |
| --- | --- |
| exact | `weight + 300` |
| prefix | `weight + 180` |
| contains | `weight` |

Итоговая сортировка: по score → по `displayPriority` → по `displayName`.

Каждая result card показывает `displayName`, badge (`Профиль`, `Базовый профиль`, `Исторический`, `По базовому стилю` и т.д.) и compact ion summary `Ca / Mg / Na / Cl / SO4 / HCO3`.

### Saved профили (localStorage)

Saved source/target profiles **не** входят в recipe payload, живут только в браузере:

- source key: `nb:recipe-water:source-profiles`;
- target key: `nb:recipe-water:target-profiles`.

Санитизация при чтении: malformed entries отбрасываются; duplicate ids убираются; non-negative numeric coercion; `ph` допускается только в `0..14`; список режется до **30** профилей.

Dropdown показывает только имена (без ion summary), у каждой строки — trash-button. Удаление активного source → откат на `defaultSourcePreset()` (`Осмос`). Удаление активного saved target → mode `catalog`, очистка `targetProfileSavedId/Source/Name/Profile` (пользователь остаётся без active target).

Сохранение manual профиля: кнопка `Сохранить` → input имени + `ОК`/`Отмена`. Default name source: `Сохранённый профиль N` (`getNextSavedSourceWaterProfileName`), target: `Целевой профиль N`. После сохранения профиль становится active, список режется до 30, показывается `<name> сохранён`.

Wizard **не** применяет первый saved source автоматически при `setupEnabled === false` — только после явного выбора.

---

## Engine modes

`resolveRecipeWaterEffectiveEngine()`:

```ts
if (engine === "advanced_manual") return "advanced_manual";
return targetMashPh != null && engine !== "profile_only"
  ? "balanced_default"
  : "profile_only";
```

Итого:

- `balanced_default` (есть `targetMashPh`) — считает соли (auto solver) и pH;
- `profile_only` — считает соли (auto solver), но не считает pH затора;
- `advanced_manual` — auto solver **не** запускается, берутся только `manualSaltAdditions`; pH может считаться, если `targetMashPh != null`.

UI больше не показывает отдельный режим «Авторасчёт / Ручной план». Расчёт в мастере — это preview; кнопка `Применить расчёт` копирует рассчитанные соли в `manualSaltAdditions` (и переводит engine в `advanced_manual`); если добавки уже есть, кнопка называется `Заменить добавки`.

---

## Объёмы (откуда берётся вода, приоритет)

### Входные данные расчёта

`buildRecipeWaterPlanResult()` получает:

| Input | Откуда берётся в редакторе |
| --- | --- |
| `waterPlanMeta` | React state рецепта, затем autosave в `recipes.water_plan_meta`. |
| `fallbackBatchVolumeL` | Объём партии, сконвертированный в литры из `ml/l/gal`. |
| `boilTimeMinutes` | Поле `Кипячение, мин`. |
| `equipmentVolumePlan` | Если есть `equipmentProfileSnapshot` — `calculateEquipmentVolumePlan()`. |
| `grainKg` | В редакторе сейчас сумма всех весовых строк (`g/kg/oz/lb`), а не только fermentables. |
| `beerSrm` | `preview?.color`, fallback `initialRecipe?.color`. |
| `fermentables` | Только строки категории `fermentable` (имя, subtype, вес в кг) — для pH-классификации засыпи. |

> Расхождение редактор vs публичная страница: `PublicRecipeWaterSection` строит `grainKg` только из fermentable-категории; в редакторе в `grainKg` для water plan могут немного попасть весовые строки хмеля/добавок (см. «Ограничения»).

### Формулы оборудования

`calculateEquipmentVolumePlan()`:

```text
boilTimeHr = boilTimeMinutes > 0 ? boilTimeMinutes / 60 : 1

fermenterTargetColdL = targetBatchVolumeL
postBoilColdBeforeKettleLossL = fermenterTargetColdL + trubChillerLossL
postBoilHotL = postBoilColdBeforeKettleLossL / (1 - coolingShrinkagePct / 100)
preBoilHotL = postBoilHotL + evaporationRateLPerHr * boilTimeHr
grainAbsorptionLossL = max(0, grainKg) * grainAbsorptionLPerKg
totalWaterL = max(0, preBoilHotL + grainAbsorptionLossL)

desiredMashWaterL = max(0, grainKg) * mashThicknessLPerKg
maxMashWaterL = maxMashVolumeL ?? desiredMashWaterL
mashWaterL = min(totalWaterL, desiredMashWaterL, maxMashWaterL)
spargeWaterL = max(0, totalWaterL - mashWaterL)
```

`maxKettleVolumeL` / `maxMashVolumeL` могут создавать warnings внутри equipment volume plan, но `buildRecipeWaterPlanResult()` их в water UI **не** прокидывает.

### Если профиля оборудования нет

Логика не падает прямо на batch size. Если `equipmentVolumePlan` не передан, но `fallbackBatchVolumeL > 0`, строится временный fallback equipment profile из `starterEquipmentProfileDefaults`:

```text
targetBatchVolumeL = fallbackBatchVolumeL
evaporationRateLPerHr = 3
trubChillerLossL = 1
grainAbsorptionLPerKg = waterPlanMeta.grainAbsorptionLPerKg ?? 0.8
coolingShrinkagePct = 4
mashThicknessLPerKg = 3
```

Поэтому источник объёма часто будет `estimated_total_water`, а не `batch_size`.

Пример (20 л, 5 кг зерна, 60 мин, дефолты):

```text
postBoilColdBeforeKettleLossL = 20 + 1 = 21
postBoilHotL = 21 / 0.96 = 21.875
preBoilHotL = 21.875 + 3 = 24.875
grainAbsorptionLossL = 5 * 0.8 = 4
totalWaterL = 28.875 л
mashWaterL = 5 * 3 = 15 л
spargeWaterL = 13.875 л
```

### Приоритет общего объёма

```ts
automaticTotalWaterL = roundTo(max(0,
  waterPlanMeta.totalWaterVolumeL ??
  equipmentVolumePlan?.totalWaterL ??
  estimatedEquipmentVolumePlan?.totalWaterL ??
  fallbackBatchVolumeL ??
  0
), 2)
```

`waterVolumes.source` выбирается так:

1. `manual_split` — задан `mashWaterVolumeL` или `spargeWaterVolumeL`;
2. `manual_total` — задан `totalWaterVolumeL`;
3. `equipment_profile` — передан `equipmentVolumePlan`;
4. `estimated_total_water` — построен fallback equipment plan;
5. `batch_size` — остался только batch size.

### Split на затор и промывку

`hasManualSplit = mashWaterVolumeL != null || spargeWaterVolumeL != null`.

Если split не включён:

```text
mashWaterL = automaticTotalWaterL
spargeWaterL = 0
totalWaterL = automaticTotalWaterL
```

Если split включён:

```text
mashWaterL = mashWaterVolumeL ?? automaticTotalWaterL - (spargeWaterVolumeL ?? 0)
spargeWaterL = spargeWaterVolumeL ?? automaticTotalWaterL - mashWaterL
totalWaterL = mashWaterL + spargeWaterL
```

UI (шаг 3) показывает 2 карточки: `Считать одним объёмом` и `Разделить на затор и промывку`. При первом переключении в split берётся suggested split из equipment/fallback plan; если suggestions нет — fallback 65% затор / 35% промывка. Поля `Заторная вода, л` / `Промывочная вода, л` (`type=number`, `step=0.1`, пусто → `null`).

`Считать одним объёмом` (`setRecipeWaterVolumeMode(..., "single", ...)`) обнуляет `mash/sparge/totalWaterVolumeL` и `spargeAcidificationEnabled = false`. При переключении обратно в single все manual salt targets нормализуются в `target: "all"`.

Warning `water_split_below_batch_volume` — только если ручной split меньше batch size:

```text
mashWaterL + spargeWaterL + 0.05 < fallbackBatchVolumeL
```

Split больше batch size — нормально (absorption, кипячение, trub/chiller loss, shrinkage). Автоматической пересборки split под новый batch size нет.

---

## Соли и solver

### Нормализация профилей

Source/target нормализуются с fallback на нули:

```ts
{ ca: profile?.ca ?? 0, mg: ..., na: ..., cl: ..., so4: ..., hco3: ..., ph: profile?.ph ?? null }
```

Meaningful profile = хотя бы один из `ca/mg/na/cl/so4/hco3` больше `0`.

### Формула вклада солей

```text
ppmIonDelta = (saltGrams * 1000 * ionMassFraction) / waterLiters
```

`applySaltAdditions()` добавляет delta к source profile и округляет каждый ион до 3 знаков.

Соли и mass fractions (`brewingSaltDefinitions`). `formula` — химформула в core; в UI (`recipeWaterSaltPresentation`) показываются упрощённые формулы безводной соли (в скобках):

| Salt id | Формула (core / UI) | Ионы (mass fractions) | Набор |
| --- | --- | --- | --- |
| `gypsum` | `CaSO4.2H2O` / `CaSO4` (Гипс) | `Ca = 40.078/172.169`, `SO4 = 96.061/172.169` | quick + manual |
| `calcium_chloride` | `CaCl2.2H2O` / `CaCl2` (Хлорид кальция) | `Ca = 40.078/147.014`, `Cl = 70.906/147.014` | quick + manual |
| `epsom_salt` | `MgSO4.7H2O` / `MgSO4` (Эпсомская соль) | `Mg = 24.305/246.475`, `SO4 = 96.061/246.475` | quick + manual |
| `table_salt` | `NaCl` (Соль поваренная) | `Na = 22.99/58.44`, `Cl = 35.45/58.44` | manual |
| `baking_soda` | `NaHCO3` (Сода пищевая) | `Na = 22.99/84.006`, `HCO3 = 61.016/84.006` | optional auto + manual |
| `chalk` | `CaCO3` (Мел) | `Ca = 40.078/100.087`, `HCO3 = 122.032/100.087` | manual (advancedOnly, lowSolubility) |
| `slaked_lime` | `Ca(OH)2` (Гашёная известь) | `Ca = 40.078/74.093`, `HCO3 = 122.032/74.093` | manual (advancedOnly) |

`chalk` и `slaked_lime` представлены как вклад в кальций и бикарбонатную щелочность, без реальной модели растворимости/CO2.

### Какие соли доступны solver-у

- **Quick set** (любой auto engine): `gypsum`, `calcium_chloride`, `epsom_salt`.
- **Optional auto:** `baking_soda` — только если `allowedSalts` явно его включает (checkbox `Считать пищевую соду (NaHCO3) в авторасчёте`). Тогда `allowedSalts = ["gypsum", "calcium_chloride", "epsom_salt", "baking_soda"]`.
- **Advanced set** (`advanced_manual`): все соли из `brewingSaltDefinitions`, включая `table_salt`, `chalk`, `slaked_lime`.

Правило `resolveAllowedSalts()`: если `allowedSalts` заданы явно — берутся валидные из них; иначе `advanced_manual` → полный набор, любой auto engine → quick set.

### Когда запускается auto solver

Одновременно: `setupEnabled === true`; engine не `advanced_manual`; target profile meaningful; `totalWaterL > 0`. Иначе список auto salts = `[]`.

### Алгоритм target solver (`solveWaterTargetProfile`)

Constrained practical solver (greedy coordinate descent), приближённый к Brewfather Auto defaults:

1. score считается только по ионам, которые реально меняют включённые соли (`getSaltAdjustedIonKeys`). Например, без baking soda ионы `Na`/`HCO3` в score не входят;
2. старт: 0 г каждой соли;
3. шаги `[1, 0.25, 0.05, 0.01]` г;
4. для каждой соли пробуются направления `+step` и `-step`; принимается, если улучшает score (epsilon `0.0001`);
5. лимит на одну соль `0..20 г` (`maxGramsPerSalt`);
6. guard `1200` итераций на шаг;
7. на выходе граммы округляются до `0.01 г`.

Score = сумма квадратов отклонений по ионам, веса всех ионов = `1` (`ca/mg/na/cl/so4/hco3`).

**Overshoot:** в recipe water plan solver вызывается с `preventTargetOvershoot: false` (может немного превысить отдельные target-ионы, если общий score лучше). Это отличается от дефолта core solver (`preventTargetOvershoot ?? true`). При включённой защите candidate отбрасывается, если выводит регулируемый ион выше `max(source, target)` (+ tolerance `0.01`).

### Manual salts (`advanced_manual`)

Auto solver не используется. `manualSaltAdditions` фильтруются: salt id известен; grams finite и `> 0`; grams округляется до `0.01 г`; `target ∈ {all, mash, sparge}`, иначе fallback `all`. Пустой manual list означает «без солей», а не fallback в auto.

UI manual позволяет выбрать: `gypsum`, `calcium_chloride`, `epsom_salt`, `baking_soda`, `table_salt`, `chalk`, `slaked_lime`.

### Split солей между затором и промывкой

Auto solver считает соли на `totalWaterL` и помечает их `target: "all"`. Для отображения в split mode делятся по bucket-ам:

```text
target = all:    mash = grams * mashWaterL / totalWaterL;   sparge = grams * spargeWaterL / totalWaterL
target = mash:   mash = grams;  sparge = 0
target = sparge: mash = 0;      sparge = grams
```

`finalProfile` = применение всех salt additions к `totalWaterL`. Для pH затора отдельно строится `mashProfileForPh`: применяются только соли bucket `mash` к `mashWaterL`. То есть auto solver сам по себе затор и промывку отдельно не решает; manual mode позволяет явно задать место внесения.

### Финальный профиль и производные

- `finalProfile = totalWaterL > 0 ? source + saltAdditions : source`;
- `sulfateChlorideRatio = so4 / cl`, если `cl > 0`, иначе `null`;
- `alkalinityAsCaCO3FromHco3 = roundTo(hco3 * 50 / 61, 2)`;
- `residualAlkalinityAsCaCO3 = alkalinity - (ca / 1.4 + mg / 1.7)`.

---

## Mash pH

### Когда считается

```text
engine !== "profile_only"   (т.е. mashPhEnabled)
targetMashPh != null
grainKg > 0
mashWaterL > 0
```

Если pH запрошен, но `grainKg <= 0` → warning `grain_bill_missing_for_mash_ph` (и `mashPhEstimate = null`).

### Классификация засыпи

`summarizeFermentablesForMashPh()` смотрит только на `fermentables` (категория `fermentable`). Классификация строковая по `name + subtype` в lowercase:

| Условие | Класс |
| --- | --- |
| содержит `acidulated` или `sour` | `acidulated` |
| содержит `roast`, `black`, `chocolate` | `roasted` |
| содержит `crystal`, `caramel`, `cara` | `crystal` |
| содержит `adjunct`, `sugar`, `rice`, `corn` | `adjunct` |
| иначе | `base` |

В проценты идут: `pctRoasted`, `pctCrystalCaramel`, `pctAcidulated`, `pctNonRoastedSpecialty = crystal + acidulated`. Русские названия (`жжёный`, `карамельный`, `кислый солод`) этой эвристикой не распознаются, если нет соответствующих английских токенов.

### Residual alkalinity

```text
alkalinityAsCaCO3 = HCO3 * 50 / 61
effectiveHardness = Ca / 1.4 + Mg / 1.7
residualAlkalinityAsCaCO3 = alkalinityAsCaCO3 - effectiveHardness
raShift = 0.00168 * residualAlkalinityAsCaCO3
```

### Модель `kolbach_ra_quick`

```text
predictedMashPh20C = baseMaltDiPh + raShift + calibrationOffset
```

где `baseMaltDiPh = 5.7` (если не передан), `calibrationOffset = waterPlanMeta.calibrationOffset ?? 0`, результат округляется до `0.01 pH`.

### Модель `hybrid_mash_ph_v1`

```text
mashThickness = grainKg > 0 ? mashWaterL / grainKg : 3
thicknessAdjustment = clamp(-0.03, 0.03, (mashThickness - 3) * 0.01)
plato = max(1, 12)   // фактически зафиксировано как 12

colorShift =
  beerSrm != null
    ? -1 * (beerSrm * (0.21 * pctNonRoastedSpecialty/100 + 0.06 * pctRoasted/100)) / plato
    : 0

specialtyMaltClassAdjustment = -0.08 * pctCrystalCaramel/100 - 0.18 * pctRoasted/100
acidulatedMaltAdjustment = -0.1 * pctAcidulated
mineralAdjustment = clamp(-0.06, 0.03, ((Ca + Mg) - 80) / 1000)

predictedMashPh20C =
  5.7
  + raShift
  + thicknessAdjustment
  + colorShift
  + specialtyMaltClassAdjustment
  + acidulatedMaltAdjustment
  + mineralAdjustment
  + calibrationOffset
```

**Важно:** `acidulatedMaltAdjustment = -0.1 * pctAcidulated` использует проценты как целые значения (не доли). Поэтому 5% acidulated malt дают `-0.5 pH`. Это текущее поведение кода.

Обе модели возвращают warning `mash_ph_ballpark_estimate` (UI считает его low-priority и обычно не показывает). Это practical approximation, а не полноценная mash chemistry.

### Итоговый predicted mash pH

`predictedMashPhAfterAcid20C`:

- если есть `mashAcidAddition` → его `predictedMashPh20C`;
- иначе если есть `mashPhEstimate` → unadjusted estimate;
- иначе `null`.

Это значение — главный pH-output в summary-card.

---

## Sparge / acid

### Поддерживаемые кислоты

| Acid id | Default % | MW (g/mol) | Density (g/ml) | effectiveProtons |
| --- | --- | --- | --- | --- |
| `lactic_acid` | 88% | 90.078 | 1.206 | 1 |
| `phosphoric_acid` | 85% | 97.994 | 1.685 | 1 |

`resolveAcid()`: `selectedAcid` (если валидна) → первый allowed acid → fallback `lactic_acid`. Если `acidConcentrationPct` пустой — берётся default выше (placeholder в UI: `88` / `85`).

### Нейтрализация

```text
acidGramsPerMl = densityGPerMl * clamp(concentrationPct, 0..100) / 100
molesPerMl = acidGramsPerMl / molecularWeightGPerMol
acidNeutralizationMeqPerMl = molesPerMl * effectiveProtons * 1000
```

### Practical pH drop model

```text
acidMeq = acidNeutralizationMeqPerMl * acidMl
alkalinityMeq = max(0, alkalinityAsCaCO3) * max(0, waterLiters) / 50
practicalBufferMeqPerPh = max(20, grainKg * 40 + waterLiters * 2 + alkalinityMeq * 2)
phDrop = acidMeq / practicalBufferMeqPerPh
predictedPh = unadjustedMashPh20C - phDrop
```

### Подбор объёма (`solveMashAcidAddition`)

- если `unadjustedMashPh20C <= targetMashPh20C` → `0 мл` + warning `target_already_reached`;
- иначе binary search, `40` итераций, диапазон `0..maxMl`, где `maxMl = max(5, waterLiters * 2)`;
- если target не достигнут на maxMl → warning `target_not_reached_within_max_acid`;
- результат округляется до `0.01 мл`;
- всегда добавляет `mash_acid_model_practical_approximation`.

### Кислота в затор

```text
unadjustedMashPh20C = mashPhEstimate.predictedMashPh20C
targetMashPh20C = waterPlanMeta.targetMashPh
waterLiters = mashWaterL
grainKg = grainKg
alkalinityAsCaCO3 = alkalinityAsCaCO3FromHco3(finalProfile.hco3)
```

Нюанс: alkalinity для mash acid берётся из `finalProfile.hco3`, а **не** из `mashProfileForPh.hco3`.

### Кислота в промывку

Считается только если `spargeAcidificationEnabled === true` и `spargeWaterL > 0`:

```text
unadjusted = spargeSourcePh ?? sourceProfile.ph ?? 7
target = targetSpargePh ?? 5.7
waterLiters = spargeWaterL
grainKg = 0
alkalinityAsCaCO3 = targetSpargeAlkalinity ?? alkalinityAsCaCO3FromHco3(sourceProfile.hco3)
```

Используется тот же `solveMashAcidAddition()`, результат переименовывается в `spargeAcidMl`. Sparge acidification не использует grist; ориентируется на source water pH и alkalinity; остаётся practical approximation.

UI (шаг 4): карточка `Корректировать pH затора` (checkbox → `targetMashPh = 5.35` / `null`, input `Целевой pH затора`). Карточка `Подкислить промывочную воду` видна только в split mode при `spargeWaterL > 0` (inputs `Исходный pH` default `spargeSourcePh ?? sourceProfile.ph ?? 7`, `Целевой pH промывки` default `5.7`). В single mode блока промывки нет; при переключении в single `spargeAcidificationEnabled` сбрасывается.

---

## Расчёт и добавки воды (UI)

Блок `Расчёт` живёт внутри раскрытой настройки после шага pH. Показывает рассчитанные соли и кислоту (если расчёт дал положительный объём), группировка по `Весь объём` / `Затор` / `Промывка` в split mode. Acid row попадает в результат только при положительном объёме кислоты; `0 мл` не показывается.

Кнопка: `Применить расчёт` (если фактических добавок нет) или `Заменить добавки` (если уже есть). Копирует соли в `manualSaltAdditions`.

`RecipeWaterAdditivesSection`: при `setupEnabled !== true` — empty state `Нет добавок воды`. Иначе — `Добавки воды` (строки солей из `manualSaltAdditions`, кислота рядом, `Итоговый профиль воды` только при наличии реальных строк). Ручные соли редактируются прямо в строке; кислота не редактируется как отдельная строка (её параметры — в pH/advanced).

`Расширенные настройки` (`<details>`, свёрнут): при `mashPhEnabled` — `Модель pH` (`Kolbach RA quick` / `Hybrid mash pH v1`) и `Калибровка pH` (range `-2..2`, step `0.01`, placeholder `0.00`); при включённом любом acid calc — `Кислота` (`Молочная` / `Фосфорная`) и `Концентрация кислоты, %` (optional, placeholder `88`/`85`); checkbox `Считать пищевую соду (NaHCO3) в авторасчёте` (default off).

---

## Склад и каталог добавок

Расчётные соли/кислоты мапятся на catalog ids (`water-additives-catalog.ts`):

| Расчётный id | Catalog id |
| --- | --- |
| `gypsum` | `gypsum` |
| `calcium_chloride` | `calcium-chloride-dihydrate` |
| `epsom_salt` | `epsom-salt` |
| `baking_soda` | `sodium-bicarbonate` |
| `table_salt` | `sodium-chloride` |
| `chalk` | `calcium-carbonate` |
| `slaked_lime` | `calcium-hydroxide` |
| `lactic_acid` | `lactic-acid` |
| `phosphoric_acid` | `phosphoric-acid-75-85` |

`RecipeWaterAdditivesSection` вызывает `getRecipeWaterAdditivesStockAction()` → `listRecipeWaterAdditivesStockStatus()`. Проверка: catalog-linked inventory по нужным ids + custom `water_treatment` inventory; для custom acids catalog id выводится по derived metadata или названию (`молоч/lactic`, `фосфор/phosphor`); учитывается concentration percent; если в складе ровно одна концентрация выбранной кислоты и `acidConcentrationPct` пуст — UI может подставить её в расчёт.

Склад **не** ограничивает расчёт: recommended amount остаётся тем же, UI лишь показывает `Нет на складе`.

Каталог `ingredients/new/water_treatment_catalog_minimal_v2.json` содержит `28` items. Используется для поиска/склада/metadata, но **не** является источником химических формул solver-а — solver берёт определения из `packages/brewing-core/src/calculations/water.ts`.

---

## Warnings / пороги ионов

`RecipeWaterPlanResult.warnings` — дедуплицированный список.

UI показывает над настройкой только первые 3 visible warnings:

```ts
waterPlanResult.warnings
  .filter((w) => !lowPriorityWarnings.has(w))
  .slice(0, 3)
```

Low-priority (скрыты из UI): `mash_ph_ballpark_estimate`, `mash_acid_model_practical_approximation`, `target_already_reached`.

User-facing labels:

| Warning key | UI text |
| --- | --- |
| `water_split_below_batch_volume` | Сумма заторной и промывочной воды меньше объёма партии. |
| `source_profile_missing_or_zero` | Выберите исходную воду или введите профиль вручную. |
| `target_profile_missing_or_zero` | Выберите целевой профиль воды. |
| `grain_bill_missing_for_mash_ph` | Для расчёта pH нужна засыпь. |
| `target_not_reached_within_max_acid` | Целевой pH не достигнут в лимите кислоты. |
| `calcium_above_practical_range` | Ca выше практического диапазона. |
| `magnesium_above_practical_range` | Mg выше практического диапазона. |
| `sodium_above_practical_range` | Na выше практического диапазона. |
| `chloride_above_practical_range` | Cl выше практического диапазона. |
| `sulfate_above_practical_range` | SO4 выше практического диапазона. |
| `bicarbonate_above_practical_range` | HCO3 выше практического диапазона. |

Practical range thresholds для `finalProfile`:

| Ion | Threshold |
| --- | --- |
| Ca | `> 250 ppm` |
| Mg | `> 40 ppm` |
| Na | `> 150 ppm` |
| Cl | `> 250 ppm` |
| SO4 | `> 350 ppm` |
| HCO3 | `> 250 ppm` |

Warnings профилей (`source/target_profile_missing_or_zero`) добавляются только при `setupEnabled === true`; source-warning не поднимается для `ro_distilled` / `distilled`.

---

## Ограничения (что НЕ учитывается)

Текущая модель — practical calculator, не лабораторный симулятор. Не учитывается:

- реальное смешивание вод через `blendRatio` (поле есть, расчёт не использует);
- разбавление source осмосом/дистиллятом как операция расчёта;
- уменьшение ионов, кроме как через выбор другого source profile вручную;
- реальные carbonate equilibria, CO2, растворимость chalk/lime и precipitation;
- изменение минерализации из-за кипячения/испарения как концентрация ионов;
- изменение `finalProfile` от добавления кислоты;
- pH целевого профиля воды;
- source pH для pH затора (используется только как fallback для pH промывки);
- лабораторные malt DI pH, реальные буферные ёмкости конкретных солодов, measured mash pH;
- русскоязычные эвристики классификации солодов для pH;
- equipment warnings из `calculateEquipmentVolumePlan()` в water UI;
- стоимость рассчитанных добавок;
- наличие склада как constraint;
- автоматическое создание/обновление `recipe_ingredients` из рассчитанных солей/кислот;
- ручные `water_treatment` ingredients как соли/кислоты для химического расчёта.

### Известные нюансы

1. Без equipment profile общий объём обычно берётся не из batch size напрямую, а из fallback equipment estimate (`estimated_total_water`).
2. В редакторе `grainKg` для water plan суммирует все весовые строки ингредиентов, не только fermentables; pH-классификация при этом берёт только fermentables. На публичной странице `grainKg` — только по fermentables.
3. Auto solver в recipe flow вызывается с `preventTargetOvershoot: false` — может предпочесть профиль с overshoot по одному иону, если общий score лучше.
4. `target HCO3` и `target Na` фактически не влияют на default auto solver, пока не включена baking soda (или не задан другой `allowedSalts`), т.к. score строится только по ионам, которые выбранные соли могут менять.
5. `acidulatedMaltAdjustment = -0.1 * pctAcidulated` использует проценты как целые значения — сильная pH-поправка при заметной доле acidulated malt.
6. Brew batch при создании сохраняет `waterPlanSnapshot = recipe.waterPlanMeta`, а не рассчитанный `waterPlanResult`.

### Legacy compatibility

- `recipeWaterPlanMetaSchema` не ломает старые записи;
- legacy target modes `balanced`, `malty`, `hoppy`, `style` парсятся schema-слоем; `ensureRecipeWaterPlanConfigured()` нормализует их в `catalog`;
- `builtInTargetWaterProfiles` и historical source presets (`Pilsen`/`Dublin`/`Munich`) остаются в коде/данных, но не выводятся в текущий UI;
- `showWaterAdditivesInIngredients`, `blendRatio`, `targetSpargeAlkalinity`, `totalWaterVolumeL` остаются в schema/persistence; в normal flow не выставляются через UI.

### Публичный вывод

`PublicRecipeWaterSection`: ничего не показывает, если `waterPlanMeta?.setupEnabled` выключен; пересчитывает water plan по сохранённому рецепту; скрывает секцию, если нет ни рассчитанных добавок, ни имени target profile.
