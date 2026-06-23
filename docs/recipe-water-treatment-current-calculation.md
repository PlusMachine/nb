# Блок водоподготовки: текущая расчетная модель

Дата проверки: 2026-05-13.

Документ описывает фактическое поведение блока `Водоподготовка` в мастере рецептов: откуда берутся объемы, какие поля участвуют в расчете, по каким формулам считаются соли, pH и кислота, а также что сейчас не учитывается.

Главные runtime-файлы:

- `apps/web/components/recipes/recipe-designer.tsx` - собирает входные данные и рендерит секцию `Водоподготовка`.
- `apps/web/components/recipes/water-setup-wizard.tsx` - UI настройки source/target/split/pH и расчетного предложения.
- `apps/web/components/recipes/recipe-water-additives-section.tsx` - показывает рассчитанные соли/кислоты и проверку склада.
- `apps/web/features/recipes/water-plan.ts` - рецептный расчет volume plan, salt plan, pH и acid plan.
- `packages/brewing-core/src/calculations/water.ts` - низкоуровневые формулы воды.
- `apps/web/features/equipment-profiles/volume-plan.ts` - расчет общего объема воды от профиля оборудования.
- `apps/web/features/recipes/water-target-profiles.ts` - каталог целевых профилей воды.
- `apps/web/features/recipes/water-additives-service.ts` - проверка наличия рассчитанных добавок на складе.

## Коротко

Блок `Водоподготовка` сейчас состоит из трех разных сущностей:

1. Расчет воды.
   Он берется из `waterPlanMeta` и `buildRecipeWaterPlanResult()`, показывается внутри `WaterSetupWizard` и не попадает в список добавок без действия пользователя.

2. Список добавок воды.
   Он показывается в `RecipeWaterAdditivesSection`. Технически соли хранятся в `waterPlanMeta.manualSaltAdditions` при `engine = "advanced_manual"`, но UI не называет это отдельным режимом.

3. Обычные ингредиенты категории `water_treatment`.
   Пользователь может добавить их вручную как ингредиенты рецепта. Они видны в той же секции, но сами по себе не управляют химическим расчетом воды.

Расчетный результат (`waterPlanResult`) не хранится в БД. В рецепте сохраняется только `waterPlanMeta` в `recipes.water_plan_meta`, а результат пересчитывается на лету при рендере редактора и публичной страницы.

## UI и состояние

В `RecipeDesigner` секция `Водоподготовка` показывает:

- сверху фактический список добавок воды через `RecipeWaterAdditivesSection`;
- затем вручную добавленные recipe ingredients категории `water_treatment`, если они есть;
- затем embedded `WaterSetupWizard` с расчетом и кнопкой `Применить расчет` / `Заменить добавки`.

`waterPlanMeta.setupEnabled` - граница между "вода реально настроена" и "показываем стартовые значения для редактирования".

Если `setupEnabled = false`, wizard все равно строит display/effective state через `ensureRecipeWaterPlanConfigured()`: подставляет осмос как стартовый source и дает редактировать source/target. Но шаги split/pH/advanced появляются только после первого действия пользователя, которое сохраняет `setupEnabled = true`.

`createRecipeWaterPlanResetMeta()` сбрасывает source, target, split, ручные соли, кислоту, calibration и возвращает `setupEnabled = false`.

## Что хранится в `waterPlanMeta`

Ключевые поля:

| Поле | Назначение |
| --- | --- |
| `setupEnabled` | Включена ли фактическая настройка воды. |
| `engine` | `profile_only`, `balanced_default`, `advanced_manual`. |
| `phModel` | `kolbach_ra_quick` или `hybrid_mash_ph_v1`. |
| `sourceProfile*` | Режим, id/name и ионы исходной воды. |
| `targetProfile*` | Режим, slug/name/source и ионы целевого профиля. |
| `mashWaterVolumeL`, `spargeWaterVolumeL` | Ручной split на затор/промывку. |
| `totalWaterVolumeL` | Legacy override общего объема. В UI сейчас почти не выставляется, но расчет поддерживает. |
| `grainAbsorptionLPerKg` | Override поглощения воды дробиной. |
| `allowedSalts` | Явный набор солей для auto solver. Обычно пустой. |
| `manualSaltAdditions` | Ручные соли для `advanced_manual`. |
| `targetMashPh` | Целевой pH затора. `null` отключает расчет pH затора. |
| `spargeAcidificationEnabled` | Включено ли подкисление промывки. |
| `spargeSourcePh`, `targetSpargePh`, `targetSpargeAlkalinity` | Входы для кислоты в промывку. |
| `selectedAcid`, `acidConcentrationPct` | Кислота и ее концентрация. |
| `calibrationOffset` | Ручная поправка к pH-модели. |

`blendRatio` и `showWaterAdditivesInIngredients` в схеме остаются для совместимости, но текущий расчет их не использует. `showWaterAdditivesInIngredients` помечен как deprecated.

## Входные данные расчета

`buildRecipeWaterPlanResult()` получает:

| Input | Откуда берется в редакторе |
| --- | --- |
| `waterPlanMeta` | React state рецепта, затем autosave в `recipes.water_plan_meta`. |
| `fallbackBatchVolumeL` | Верхний объем партии, сконвертированный в литры из `ml/l/gal`. |
| `boilTimeMinutes` | Верхнее поле `Кипячение, мин`. |
| `equipmentVolumePlan` | Если есть `equipmentProfileSnapshot`, считается через `calculateEquipmentVolumePlan()`. |
| `grainKg` | В редакторе сейчас сумма всех строк с весовыми единицами `g/kg/oz/lb`, а не только fermentables. |
| `beerSrm` | `preview?.color`, fallback на `initialRecipe?.color`. |
| `fermentables` | Только строки категории `fermentable`: имя, subtype, вес в кг. Используются для pH-классификации засыпи. |

На публичной странице `PublicRecipeWaterSection` строит `grainKg` иначе: только из ингредиентов fermentable-category. Это важное текущее расхождение: в редакторе весовые строки хмеля/добавок могут немного попасть в `grainKg` для water plan, а на публичной странице нет.

## Расчет volume plan

Если выбран профиль оборудования, `RecipeDesigner` строит effective equipment profile:

```ts
targetBatchVolumeL = batchVolumeL ?? equipmentProfileSnapshot.targetBatchVolumeL
grainAbsorptionLPerKg =
  waterPlanMeta.grainAbsorptionLPerKg ??
  equipmentProfileSnapshot.grainAbsorptionLPerKg
```

Затем вызывается:

```ts
calculateEquipmentVolumePlan(effectiveEquipmentProfile, grainKg, boilTimeMinutes)
```

### Формулы оборудования

В `calculateEquipmentVolumePlan()`:

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

`maxKettleVolumeL` и `maxMashVolumeL` могут создать warnings внутри equipment volume plan, но `buildRecipeWaterPlanResult()` сейчас эти warnings не прокидывает в water UI.

### Если профиля оборудования нет

Текущая логика не падает прямо на batch size. Если `equipmentVolumePlan` не передан, но есть `fallbackBatchVolumeL > 0`, `water-plan.ts` строит временный fallback equipment profile из `starterEquipmentProfileDefaults`:

```text
targetBatchVolumeL = fallbackBatchVolumeL
evaporationRateLPerHr = 3
trubChillerLossL = 1
grainAbsorptionLPerKg = waterPlanMeta.grainAbsorptionLPerKg ?? 0.8
coolingShrinkagePct = 4
mashThicknessLPerKg = 3
```

Поэтому источник объема часто будет `estimated_total_water`, а не `batch_size`.

Пример для 20 л, 5 кг зерна, 60 минут кипячения и дефолтов:

```text
postBoilColdBeforeKettleLossL = 20 + 1 = 21
postBoilHotL = 21 / 0.96 = 21.875
preBoilHotL = 21.875 + 3 = 24.875
grainAbsorptionLossL = 5 * 0.8 = 4
totalWaterL = 28.875 л
mashWaterL = 5 * 3 = 15 л
spargeWaterL = 13.875 л
```

### Приоритет общего объема

В `buildRecipeWaterPlanResult()`:

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

1. `manual_split`, если задан `mashWaterVolumeL` или `spargeWaterVolumeL`;
2. `manual_total`, если задан `totalWaterVolumeL`;
3. `equipment_profile`, если передан `equipmentVolumePlan`;
4. `estimated_total_water`, если построен fallback equipment plan;
5. `batch_size`, если остался только batch size.

### Split на затор и промывку

`hasManualSplit = mashWaterVolumeL != null || spargeWaterVolumeL != null`.

Если split не включен:

```text
mashWaterL = automaticTotalWaterL
spargeWaterL = 0
totalWaterL = automaticTotalWaterL
```

Если split включен:

```text
mashWaterL =
  mashWaterVolumeL ?? automaticTotalWaterL - (spargeWaterVolumeL ?? 0)

spargeWaterL =
  spargeWaterVolumeL ?? automaticTotalWaterL - mashWaterL

totalWaterL = mashWaterL + spargeWaterL
```

При переключении в split UI берет suggested split из equipment/fallback volume plan. Если suggestions нет, fallback: 65% в затор и 35% в промывку.

Warning `water_split_below_batch_volume` появляется только если ручной split меньше batch size:

```text
mashWaterL + spargeWaterL + 0.05 < fallbackBatchVolumeL
```

Split больше batch size считается нормальным: вода может уйти на absorption, кипячение, trub/chiller loss и shrinkage.

## Source и target profiles

`WaterProfile` содержит ppm:

```ts
{ ca, mg, na, cl, so4, hco3, ph }
```

`ph` допускается, но большинство расчетов минерализации работают только с ионами.

Source UI сейчас показывает:

- `Осмос`: `Ca 1 / Mg 0 / Na 8 / Cl 4 / SO4 1 / HCO3 16 / pH 7`;
- `Дистиллированная вода`: все ионы `0`, `pH 7`;
- saved source profiles из `localStorage`;
- manual mode.

В `water-profile-presets.ts` есть исторические examples (`Pilsen`, `Dublin`, `Munich`), но в текущем source UI они не показываются. Они остаются для совместимости старых сохраненных `waterPlanMeta`.

Target profile берется из:

- каталога `ingredients/new/water_target_profiles_seed_v4_audited.json` через `water-target-profiles.ts`;
- saved target profiles из `localStorage`;
- ручного ввода.

На дату проверки в target seed: 37 профилей, 128 BJCP-маппингов, 9 quick-pick профилей.

Если выбран BJCP style, wizard умеет предложить профиль по стилю, но не применяет его автоматически до действия пользователя. Сохраненный auto-style target маркируется как `targetProfileSource = "auto_style"`.

## Нормализация профилей и warnings

Source/target нормализуются с fallback на нули:

```ts
ca = profile?.ca ?? 0
mg = profile?.mg ?? 0
na = profile?.na ?? 0
cl = profile?.cl ?? 0
so4 = profile?.so4 ?? 0
hco3 = profile?.hco3 ?? 0
ph = profile?.ph ?? null
```

Meaningful profile = хотя бы один из `ca/mg/na/cl/so4/hco3` больше `0`.

Warnings:

- source без ионов дает `source_profile_missing_or_zero`, кроме режимов `ro_distilled` и `distilled`;
- target без ионов дает `target_profile_missing_or_zero`;
- в `advanced_manual` UI не считает отсутствие target блокирующим для ручных солей.

## Engine modes

`resolveRecipeWaterEffectiveEngine()`:

```ts
if (engine === "advanced_manual") return "advanced_manual"
return targetMashPh != null && engine !== "profile_only"
  ? "balanced_default"
  : "profile_only"
```

Итого:

- `balanced_default` с `targetMashPh` считает соли и pH;
- `profile_only` считает соли, но не считает pH затора;
- `advanced_manual` не запускает auto solver солей, берет только `manualSaltAdditions`; pH может считаться, если `targetMashPh != null`.

## Формула вклада солей

Низкоуровневая формула:

```text
ppmIonDelta = (saltGrams * 1000 * ionMassFraction) / waterLiters
```

`applySaltAdditions()` добавляет delta к source profile и округляет каждый ион до 3 знаков.

Текущие соли и mass fractions:

| Salt id | Формула в core | Какие ионы меняет |
| --- | --- | --- |
| `gypsum` | `CaSO4.2H2O` | `Ca = 40.078 / 172.169`, `SO4 = 96.061 / 172.169` |
| `calcium_chloride` | `CaCl2.2H2O` | `Ca = 40.078 / 147.014`, `Cl = 70.906 / 147.014` |
| `epsom_salt` | `MgSO4.7H2O` | `Mg = 24.305 / 246.475`, `SO4 = 96.061 / 246.475` |
| `table_salt` | `NaCl` | `Na = 22.99 / 58.44`, `Cl = 35.45 / 58.44` |
| `baking_soda` | `NaHCO3` | `Na = 22.99 / 84.006`, `HCO3 = 61.016 / 84.006` |
| `chalk` | `CaCO3` | `Ca = 40.078 / 100.087`, `HCO3 = 122.032 / 100.087` |
| `slaked_lime` | `Ca(OH)2` | `Ca = 40.078 / 74.093`, `HCO3 = 122.032 / 74.093` |

`chalk` и `slaked_lime` доступны через manual salts. Они представлены как вклад в кальций и бикарбонатную щелочность, без реальной модели растворимости/CO2.

## Auto solver солей

Auto solver запускается только если:

```text
engine != advanced_manual
targetProfile есть
targetProfile meaningful
totalWaterL > 0
```

Default allowed salts:

```ts
["gypsum", "calcium_chloride", "epsom_salt"]
```

Если пользователь включает checkbox `Считать пищевую соду (NaHCO3) в авторасчете`, `allowedSalts` становится:

```ts
["gypsum", "calcium_chloride", "epsom_salt", "baking_soda"]
```

Если `allowedSalts` задан явно, solver берет только валидные соли из этого списка.

В recipe water plan solver вызывается с:

```ts
preventTargetOvershoot: false
```

То есть он может немного превысить отдельные target-ионы, если общий score улучшается. Это отличается от дефолта низкоуровневого core solver, где overshoot protection по умолчанию включен.

Алгоритм solver-а:

1. Score считается как сумма квадратов отклонений по ионам, которые выбранные соли вообще могут менять.
   Например, без baking soda ионы `Na/HCO3` не попадают в score.
2. Старт: 0 г каждой соли.
3. Greedy coordinate descent с шагами `[1, 0.25, 0.05, 0.01]`.
4. Для каждой соли пробуются направления `+step` и `-step`.
5. Ограничение по соли: `0..20 г` (`maxGramsPerSalt` default).
6. Если candidate score лучше текущего, состояние принимается.
7. На выходе граммы округляются до 0.01 г.

## Manual salts

В `advanced_manual` auto solver не используется вообще.

`manualSaltAdditions` фильтруются так:

- salt id должен быть известен;
- grams должен быть finite и `> 0`;
- grams округляется до 0.01 г;
- `target` должен быть `all`, `mash` или `sparge`; иначе fallback `all`.

UI позволяет выбрать:

- `gypsum`;
- `calcium_chloride`;
- `epsom_salt`;
- `baking_soda`;
- `table_salt`;
- `chalk`;
- `slaked_lime`.

## Split логика для солей

Auto solver считает общие соли на `totalWaterL`, а затем для отображения в split mode делит additions по bucket-ам.

Для каждой соли:

```text
если target = all:
  mash grams = grams * mashWaterL / totalWaterL
  sparge grams = grams * spargeWaterL / totalWaterL

если target = mash:
  mash grams = grams
  sparge grams = 0

если target = sparge:
  mash grams = 0
  sparge grams = grams
```

Auto solver additions всегда имеют `target = all`. Ручные соли могут быть `all/mash/sparge`.

`finalProfile` считается применением всех salt additions к `totalWaterL`. Для pH затора отдельно строится `mashProfileForPh`: применяются только соли, попавшие в bucket `mash`, к `mashWaterL`.

## pH затора

pH затора считается, если:

```text
waterPlanMeta.engine !== "profile_only"
targetMashPh != null
grainKg > 0
mashWaterL > 0
```

Если pH включен, но `grainKg <= 0`, добавляется warning `grain_bill_missing_for_mash_ph`.

### Классификация засыпи для pH

`summarizeFermentablesForMashPh()` смотрит только на массив `fermentables`, то есть на ингредиенты категории `fermentable`.

Классификация строковая, по `name + subtype` в lowercase:

| Условие | Класс |
| --- | --- |
| содержит `acidulated` или `sour` | `acidulated` |
| содержит `roast`, `black`, `chocolate` | `roasted` |
| содержит `crystal`, `caramel`, `cara` | `crystal` |
| содержит `adjunct`, `sugar`, `rice`, `corn` | `adjunct` |
| иначе | `base` |

В расчетные проценты идут:

- `pctRoasted`;
- `pctCrystalCaramel`;
- `pctAcidulated`;
- `pctNonRoastedSpecialty = crystal + acidulated`.

Русские названия вроде `жженый`, `карамельный`, `кислый солод` этой эвристикой сейчас не распознаются, если соответствующие английские tokens не попали в name/subtype.

### Residual alkalinity

```text
alkalinityAsCaCO3 = HCO3 * 50 / 61
effectiveHardness = Ca / 1.4 + Mg / 1.7
residualAlkalinityAsCaCO3 = alkalinityAsCaCO3 - effectiveHardness
raShift = 0.00168 * residualAlkalinityAsCaCO3
```

### `kolbach_ra_quick`

```text
predictedMashPh20C =
  baseMaltDiPh + raShift + calibrationOffset
```

где:

- `baseMaltDiPh = 5.7`, если не передан;
- `calibrationOffset = waterPlanMeta.calibrationOffset ?? 0`;
- результат округляется до 0.01 pH.

### `hybrid_mash_ph_v1`

```text
mashThickness = mashWaterL / grainKg
thicknessAdjustment = clamp(-0.03, 0.03, (mashThickness - 3) * 0.01)

colorShift =
  beerSrm != null
    ? -1 * (beerSrm * (0.21 * pctNonRoastedSpecialty/100 + 0.06 * pctRoasted/100)) / 12
    : 0

specialtyMaltClassAdjustment =
  -0.08 * pctCrystalCaramel/100
  -0.18 * pctRoasted/100

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

Важно: `pctAcidulated` здесь используется как число процентов, а не доля. Поэтому 5% acidulated malt даст `-0.5 pH`. Это текущее поведение кода.

Обе pH-модели возвращают warning `mash_ph_ballpark_estimate`. UI считает его low-priority и обычно не показывает.

## Расчет кислоты

Поддерживаются:

| Acid id | Default concentration | MW | Density |
| --- | --- | --- | --- |
| `lactic_acid` | 88% | 90.078 g/mol | 1.206 g/ml |
| `phosphoric_acid` | 85% | 97.994 g/mol | 1.685 g/ml |

Если `acidConcentrationPct` пустой, берется default выше.

Нейтрализация:

```text
acidGramsPerMl = densityGPerMl * clamp(concentrationPct, 0..100) / 100
molesPerMl = acidGramsPerMl / molecularWeightGPerMol
acidNeutralizationMeqPerMl = molesPerMl * effectiveProtons * 1000
```

`effectiveProtons` сейчас `1` для обеих кислот.

Оценка pH после заданного объема кислоты:

```text
acidMeq = acidNeutralizationMeqPerMl * acidMl
alkalinityMeq = max(0, alkalinityAsCaCO3) * max(0, waterLiters) / 50

practicalBufferMeqPerPh =
  max(20, grainKg * 40 + waterLiters * 2 + alkalinityMeq * 2)

phDrop = acidMeq / practicalBufferMeqPerPh
predictedPh = unadjustedMashPh20C - phDrop
```

Подбор объема кислоты:

- если `unadjustedMashPh20C <= targetMashPh20C`, возвращается `0 мл` и warning `target_already_reached`;
- иначе бинарный поиск до 40 итераций;
- верхняя граница `maxMl = max(5, waterLiters * 2)`;
- если target не достигнут, warning `target_not_reached_within_max_acid`;
- результат округляется до 0.01 мл.

### Кислота в затор

Для mash acid:

```text
unadjustedMashPh20C = mashPhEstimate.predictedMashPh20C
targetMashPh20C = waterPlanMeta.targetMashPh
waterLiters = mashWaterL
grainKg = grainKg
alkalinityAsCaCO3 = alkalinityAsCaCO3FromHco3(finalProfile.hco3)
```

Обратите внимание: alkalinity для подбора mash acid берется из `finalProfile.hco3`, а не из `mashProfileForPh.hco3`.

### Кислота в промывку

Считается только если:

```text
spargeAcidificationEnabled === true
spargeWaterL > 0
```

Входы:

```text
unadjusted = spargeSourcePh ?? sourceProfile.ph ?? 7
target = targetSpargePh ?? 5.7
waterLiters = spargeWaterL
grainKg = 0
alkalinityAsCaCO3 =
  targetSpargeAlkalinity ??
  alkalinityAsCaCO3FromHco3(sourceProfile.hco3)
```

Используется тот же `solveMashAcidAddition()`, результат переименовывается в `spargeAcidMl`.

## Итоговые показатели

`RecipeWaterPlanResult` возвращает:

- `waterVolumes`: `mashWaterL`, `spargeWaterL`, `totalWaterL`, suggested split, absorption и source.
- `sourceProfile`, `targetProfile`, `finalProfile`.
- `totalSaltAdditions`, `mashSaltAdditions`, `spargeSaltAdditions`.
- `sulfateChlorideRatio = SO4 / Cl`, если `Cl > 0`.
- `residualAlkalinityAsCaCO3` по `finalProfile`.
- `mashPhEstimate`.
- `mashAcidAddition`.
- `spargeAcidAddition`.
- `predictedMashPhAfterAcid20C`: pH после кислоты, либо расчетный pH без кислоты.
- `warnings`.

Практические диапазоны, которые дают warnings:

| Ion | Warning threshold |
| --- | --- |
| Ca | `> 250 ppm` |
| Mg | `> 40 ppm` |
| Na | `> 150 ppm` |
| Cl | `> 250 ppm` |
| SO4 | `> 350 ppm` |
| HCO3 | `> 250 ppm` |

## Склад и каталог добавок

Рассчитанные соли/кислоты мапятся на catalog ids:

| Расчетный id | Catalog id |
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

`RecipeWaterAdditivesSection` вызывает `getRecipeWaterAdditivesStockAction()`, а тот `listRecipeWaterAdditivesStockStatus()`.

Проверка склада:

- ищет catalog-linked inventory по нужным catalog ids;
- также ищет custom water_treatment inventory;
- для custom acids пытается вывести catalog id по derived metadata или по названию (`молоч/lactic`, `фосфор/phosphor`);
- для acids учитывает concentration percent;
- если в складе есть ровно одна концентрация выбранной кислоты и в `waterPlanMeta.acidConcentrationPct` пусто, UI может подставить эту концентрацию в расчет.

Склад не ограничивает расчет. Даже если соли нет на складе, recommended amount остается тем же; UI только показывает `Нет на складе`.

Каталог `ingredients/new/water_treatment_catalog_minimal_v2.json` на дату проверки содержит 28 items. Он используется для поиска/склада/metadata, но не является источником химических формул solver-а: solver берет определения из `packages/brewing-core/src/calculations/water.ts`.

## Сохранение и публичный вывод

В рецепте сохраняется только `waterPlanMeta`:

```text
recipes.water_plan_meta
```

`RecipeWaterPlanResult` не сохраняется. При каждом рендере редактора он пересчитывается из текущих полей рецепта, оборудования, ингредиентов и `waterPlanMeta`.

Saved source/target profiles не являются сущностями БД и не входят в recipe payload. Они живут в `localStorage`:

- `nb:recipe-water:source-profiles`;
- `nb:recipe-water:target-profiles`.

Списки режутся до 30 профилей и доступны только в браузере пользователя.

На публичной странице `PublicRecipeWaterSection`:

- ничего не показывает, если `waterPlanMeta?.setupEnabled` не включен;
- пересчитывает water plan по сохраненному рецепту;
- скрывает секцию, если нет ни рассчитанных добавок, ни имени target profile.

При создании партии `brew_batches.water_plan_snapshot` получает `recipe.waterPlanMeta`, а не рассчитанный `waterPlanResult`.

## Что сейчас не учитывается

Текущая модель - practical calculator, не лабораторный симулятор.

Не учитывается:

- реальное смешивание вод через `blendRatio`;
- разбавление source water осмосом/дистиллятом как операция расчета;
- уменьшение ионов, кроме как через выбор другого source profile вручную;
- реальные carbonate equilibria, CO2, растворимость chalk/lime и precipitation;
- изменение минерализации из-за кипячения/испарения как концентрация ионов;
- изменение `finalProfile` от добавления кислоты;
- pH целевого профиля воды;
- source pH для pH затора; source pH используется только как fallback для pH промывочной воды;
- лабораторные malt DI pH, реальные буферные емкости конкретных солодов, measured mash pH;
- русскоязычные эвристики классификации солодов для pH;
- equipment warnings из `calculateEquipmentVolumePlan()` в water UI;
- стоимость рассчитанных добавок;
- наличие склада как constraint;
- автоматическое создание/обновление `recipe_ingredients` из рассчитанных солей/кислот;
- ручные `water_treatment` ingredients как соли/кислоты для химического расчета. В редакторе их вес может косвенно попасть в `grainKg` из-за текущей широкой суммы всех весовых строк, но не как химический вклад.

## Известные нюансы текущей реализации

1. Без equipment profile общий объем обычно берется не из batch size напрямую, а из fallback equipment estimate (`estimated_total_water`).

2. В редакторе `grainKg` для water plan сейчас суммирует все весовые строки ингредиентов, не только fermentables. Детальная pH-классификация при этом берет только fermentables. На публичной странице `grainKg` считается только по fermentables.

3. Auto solver в recipe flow вызывается с `preventTargetOvershoot: false`, поэтому может предпочесть профиль с overshoot по одному иону, если общий score лучше.

4. `target HCO3` и `target Na` фактически не влияют на default auto solver, пока не включена baking soda или не задан другой `allowedSalts`, потому что score строится только по ионам, которые выбранные соли могут менять.

5. `acidulatedMaltAdjustment = -0.1 * pctAcidulated` использует проценты как целые значения. Это может давать сильную pH-поправку при заметной доле acidulated malt.

6. Brew batch при создании сохраняет `waterPlanSnapshot = recipe.waterPlanMeta`, а не рассчитанный `waterPlanResult`.
