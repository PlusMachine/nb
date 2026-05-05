# Вода и водоподготовка в мастере рецептов

Документ описывает фактическую реализацию water flow в мастере рецептов по состоянию текущего кода. Истина здесь не markdown, а runtime:

- `apps/web/components/recipes/water-setup-wizard.tsx`;
- `apps/web/components/recipes/water-summary-card.tsx`;
- `apps/web/features/recipes/water-plan.ts`;
- `apps/web/features/recipes/water-target-profiles.ts`;
- `apps/web/features/recipes/water-profile-presets.ts`;
- `apps/web/features/recipes/contracts.ts`;
- `packages/brewing-core/src/calculations/water.ts`;
- `apps/web/components/recipes/recipe-designer.tsx`;
- `apps/web/tests/recipe-water-flow-ui.test.ts`;
- `apps/web/tests/recipe-water-plan.test.ts`;
- `packages/brewing-core/src/calculations/water.test.ts`.

## 1. Где блок находится в recipe master

Вода рендерится в `RecipeDesigner` отдельным блоком `WaterSetupWizard`:

- ниже блока профилей процесса (`RecipeProfiles`);
- выше `StockCoverageSummary`;
- на том же уровне, где живут secondary planning blocks, а не в hero/header части формы.

Блок всегда присутствует на экране рецепта. Отдельного wizard-screen только для воды нет.

## 2. Верхний UX блока: как пользователь в него входит

Внешний контейнер воды — это `<details>`:

- закрыт по умолчанию;
- в summary-строке слева круглый/квадратный бейдж `H2O`;
- заголовок — `Вода`;
- справа стрелка раскрытия.

Подзаголовок summary зависит от persisted state:

- если `waterPlanMeta.setupEnabled === false`: `выберите источник`;
- если `waterPlanMeta.setupEnabled === true`: `профиль -> добавки`.

Важно:

- отдельного CTA `Настроить воду` больше нет;
- отдельного вопроса `Настроить водоподготовку?` больше нет;
- пустого экрана с единственной кнопкой запуска water flow больше нет.

Пользователь входит в water flow просто раскрывая блок `Вода`.

## 3. Главная runtime-идея: persisted state и "effective" state

Компонент различает два состояния:

1. persisted state:

```ts
waterPlanMeta
```

2. display/effective state:

```ts
const effectiveWaterPlanMeta =
  waterPlanMeta.setupEnabled
    ? waterPlanMeta
    : ensureRecipeWaterPlanConfigured(waterPlanMeta);
```

Это важный UX-нюанс текущей реализации:

- даже если вода еще не "включена" (`setupEnabled = false`), UI уже показывает пользователю подготовленную стартовую конфигурацию для редактирования;
- но шаги 3-4 и advanced остаются скрытыми, пока пользователь не совершит первое meaningful action;
- сама вода считается настроенной только после первого `onChange`, который сохраняет `setupEnabled = true`.

То есть у блока сейчас нет явного переключателя "вкл/выкл". Его фактически включает первое действие в шаге 1 или 2:

- выбор source preset;
- выбор saved source profile;
- любое ручное редактирование source ions;
- выбор target из поиска;
- выбор saved target profile;
- любое ручное редактирование target ions.

## 4. Что пользователь видит сразу после открытия блока

Если `setupEnabled = false`, в текущем UX пользователь видит:

- кнопку `Сбросить воду`;
- шаг `1. Исходная вода`;
- шаг `2. Целевой профиль`;
- source ion editor;
- target ion editor.

Но он не видит:

- summary-card сверху;
- шаг `3. Как вносить соли`;
- шаг `4. Что добавить`;
- блок `Расширенные настройки`.

То есть flow начинается не с результата, а с выбора source/target.

## 5. Реальный end-to-end flow от начала до конца

Текущий flow выглядит так:

```text
Раскрыть блок "Вода"
-> выбрать / отредактировать исходную воду
-> выбрать / отредактировать целевой профиль
-> тем самым активировать water setup
-> выбрать один объем или split mash/sparge
-> посмотреть рассчитанные соли / кислоту
-> при необходимости открыть advanced и перейти в manual mode, сменить pH model, acid, concentration, calibration
-> при необходимости сохранить source/target profile в localStorage
-> при необходимости сбросить воду обратно в disabled state
```

Ниже детально описан каждый экранный шаг.

## 6. Шаг 1. Исходная вода

### 6.1. Что видно пользователю

Верх шага:

- заголовок `1. Исходная вода`;
- справа compact label с текущим source name.

Ниже — row/grid с кнопками-режимами.

### 6.2. Какие source options реально есть в UI

Если сохраненных source profiles нет, пользователь видит 3 кнопки:

- `Осмос`;
- `Дистиллированная вода`;
- `Вручную`.

Если сохраненные source profiles есть, слева появляется еще dropdown-кнопка:

- `Сохраненный профиль` или имя текущего saved profile.

Итого в реальном rendered UI source options такие:

| UI option | Что делает |
|---|---|
| `Сохраненный профиль` | Открывает dropdown сохраненных source profiles из `localStorage` |
| `Осмос` | Выбирает preset `ro_distilled` |
| `Дистиллированная вода` | Выбирает preset `distilled_water` |
| `Вручную` | Переводит source в manual mode с текущими значениями профиля |

### 6.3. Каких source options сейчас нет в rendered flow

В коде и данных есть historical examples:

- `Pilsen`;
- `Dublin`;
- `Munich`.

Но в текущем рендере `WaterSetupWizard` они не показываются вообще.

Также в файле есть helper-компоненты `WaterProfileSelector` / `WaterProfileOption` для searchable source selector, но в текущем rendered flow они не используются.

То есть реальный стартовый source UI сейчас intentionally narrower, чем это выглядело в более ранних документах.

### 6.4. Что именно выбирают source preset buttons

Текущие built-in source presets:

| Preset | profile | mode |
|---|---|---|
| `Осмос` | `Ca 1 / Mg 0 / Na 8 / Cl 4 / SO4 1 / HCO3 16 / pH 7` | `ro_distilled` |
| `Дистиллированная вода` | `Ca 0 / Mg 0 / Na 0 / Cl 0 / SO4 0 / HCO3 0 / pH 7` | `distilled` |

Нюанс:

- `Осмос` не является буквально нулевым профилем;
- но runtime считает его допустимым low/zero-mineral source и не поднимает warning `source_profile_missing_or_zero`.

### 6.5. Как работает saved source dropdown

`SourceSavedWaterProfileOption` рендерит dropdown:

- в закрытом виде показывает только имя текущего saved profile;
- в открытом списке каждая строка содержит:
  - кнопку выбора профиля;
  - trash-button удаления.

Dropdown не показывает summary по ионам. Там только имена.

Удаление:

- если удаляется неактивный profile, просто убирается из `localStorage`;
- если удаляется текущий активный source profile, wizard откатывает source на `defaultSourcePreset()`, то есть на `Осмос`.

### 6.6. Что делает кнопка `Вручную`

Кнопка не создает пустой профиль. Она берет текущий source profile и переводит его в manual mode:

```ts
setRecipeWaterManualSourceProfile(effectiveWaterPlanMeta, source)
```

Значит:

- если до этого был `Осмос`, manual mode стартует с значений осмоса;
- если до этого был saved profile, manual mode стартует с его значений;
- если пользователь просто редактирует ионы из preset-а, он фактически "форкает" preset в manual.

### 6.7. Source ion editor

Под row с source options всегда рендерится ion editor.

Поля:

- `Ca`;
- `Mg`;
- `Na`;
- `Cl`;
- `SO4`;
- `HCO3`.

Что важно:

- поля `pH` у source profile в этом шаге нет;
- любое изменение любого ion field немедленно переводит source в `manual` mode;
- `sourceProfilePresetId` и `sourceProfileSavedId` при этом очищаются.

### 6.8. Сохранение manual source profile

Если source в `manual` mode, под ion editor появляется strip с сохранением:

- кнопка `Сохранить`;
- после ее нажатия открываются:
  - input имени профиля;
  - кнопка `ОК`;
  - кнопка `Отмена`.

Default naming:

- имя по умолчанию: `Сохраненный профиль N`;
- placeholder берется из `getNextSavedSourceWaterProfileName(...)`.

После успешного сохранения:

- профиль добавляется в `localStorage`;
- список режется до 30 записей;
- новый профиль сразу становится выбранным active source;
- показывается message `<name> сохранен`.

## 7. Шаг 2. Целевой профиль

### 7.1. Базовый UX шага

Шаг всегда visible, даже пока вода еще не активирована.

Верх:

- заголовок `2. Целевой профиль`.

Ниже — row/grid с режимами выбора target.

### 7.2. Какие target modes реально есть в UI

Если saved target profiles нет:

- `Поиск`;
- `Вручную`.

Если saved target profiles есть:

- dropdown saved target profiles;
- `Поиск`;
- `Вручную`.

Итого актуальные target options:

| UI option | Что делает |
|---|---|
| `Сохраненный профиль` | Открывает dropdown сохраненных target profiles |
| `Поиск` | Включает `catalog` mode и открывает search picker |
| `Вручную` | Переводит target в manual mode, используя текущий target profile как старт |

### 7.3. Auto-default от BJCP стиля

Если в рецепте выбран стиль (`styleId`) и для него находится BJCP mapping в `water-target-profiles.ts`, wizard делает auto-select default target profile через effect:

```ts
applyRecipeWaterCatalogTargetProfile(
  ensureRecipeWaterPlanConfigured(waterPlanMeta),
  defaultProfile,
  "auto_style",
  targetStyleKey,
  false,
)
```

Условия auto-select:

- target еще не overridden пользователем;
- target либо пустой, либо уже был `auto_style`.

Практически это означает:

- новый рецепт со стилем может получить target автоматически еще до явного действия пользователя;
- если пользователь потом руками выбрал другой target, дальнейший auto-replace прекращается.

Нюанс текущей реализации:

- в seed есть поле `auto_select_default_profile`;
- `getWaterTargetStyleDefault()` его читает;
- но сам effect в `WaterSetupWizard` это поле не использует.

То есть runtime сейчас auto-select-ит любой найденный `defaultProfile`, не проверяя флаг `autoSelectDefault`.

### 7.4. Что видно в режиме `Поиск`

При нажатии `Поиск`:

- `targetProfileMode` переключается в `catalog`;
- открывается target catalog picker.

Внутри picker:

- search input с placeholder `IPA, lager, blanche, стаут...`;
- ниже список suggested entries;
- ниже список остальных результатов каталога.

### 7.5. Что показывается без поискового запроса

Если search query пустой, возможны два сценария.

Сценарий A: для текущего стиля найден style default.

Тогда сверху показываются suggested cards:

- default profile;
- до 3 alternative profiles.

Badge у них:

- `Подходит по стилю`.

Сценарий B: style default нет.

Тогда сверху показываются quick picks:

- только первые 6 из `getWaterTargetQuickPickProfiles(6)`.

Текущий top-6 quick picks, которые реально видит пользователь без style context:

1. `Сбалансированный лагер / Blonde / Kölsch / Wit`
2. `Мягкий pilsner / мягкий лагер`
3. `Светлое и солодовое`
4. `Светлое и охмеленное`
5. `Янтарный сбалансированный / Vienna–Märzen`
6. `West Coast hoppy IPA`

Badge у них:

- `Быстрый выбор`.

Под suggested cards в обоих сценариях идет остальной каталог, но без already-featured slugs.

### 7.6. Что показывается при поисковом запросе

Если query не пустой:

- suggested cards исчезают;
- показываются только search results;
- пустое состояние пишет:

```text
Ничего не найдено. Попробуйте IPA, lager, pils, witbier, stout.
```

### 7.7. Как устроен target catalog search

Каталог строится из seed `water_target_profiles_seed_v4_audited.json`.

Текущее runtime-покрытие:

- `37` catalog profiles;
- `128` BJCP style mappings.

Нормализация поиска:

- `NFKD`;
- удаление диакритики;
- `ё -> е`;
- lower-case;
- замена punctuation/разделителей на пробел.

Search fields делятся на 3 уровня:

- `high`: имя, русское имя, slug, profile aliases;
- `medium`: intent/style family aliases;
- `low`: source aliases и description.

Scoring:

- exact match: `weight + 300`;
- prefix match: `weight + 180`;
- contains: `weight`.

Weights:

- `high = 700`;
- `medium = 420`;
- `low = 160`.

Финальная сортировка:

1. по score;
2. по `displayPriority`;
3. по `displayName`.

### 7.8. Как выглядит строка target result

Каждая result card показывает:

- `displayName`;
- badge (`Профиль`, `Базовый профиль`, `Исторический`, `По базовому стилю` и т.д. из seed group mapping);
- compact ion summary `Ca / Mg / Na / Cl / SO4 / HCO3`.

### 7.9. Что происходит после выбора target из поиска

По клику на card:

- picker закрывается;
- target переводится в `catalog` mode;
- `targetProfile` копируется из выбранного catalog item;
- `targetProfileSource = "user_catalog"`;
- `targetProfileIsOverridden = true`;
- `targetProfileResolvedFromBjcpStyleKey = current style key`.

### 7.10. Что видно после выбора target в catalog mode

Если target mode = `catalog`, picker закрыт и target уже есть, wizard показывает selection card:

- заголовок `Выбрано из поиска`;
- имя выбранного профиля;
- ion summary;
- ссылка-кнопка `Изменить`.

`Изменить` просто снова открывает picker.

### 7.11. Manual target mode

Как и source, manual target не стартует с пустоты. Кнопка `Вручную` берет текущий target profile и переводит его в manual mode.

Под ion editor в manual mode появляются:

- `Сохранить`;
- затем `ОК` / `Отмена`;
- default name `Целевой профиль N`.

Любое изменение ion fields у target также переводит его в manual mode:

```ts
setRecipeWaterManualTargetProfile(effectiveWaterPlanMeta, profile)
```

### 7.12. Saved target dropdown

UX аналогичен source:

- dropdown с именами;
- delete button у каждой строки;
- без ion summary.

Если удалить текущий active saved target:

- mode переключается в `catalog`;
- `targetProfileSavedId`, `targetProfileSource`, `targetProfileName`, `targetProfile` очищаются;
- пользователь остается без active target, пока не выберет новый.

### 7.13. Notice о смене style context

Если:

- у текущего рецепта есть новый style default;
- target уже overridden пользователем;
- target был связан с прежним `targetProfileResolvedFromBjcpStyleKey`;
- текущий style key отличается от старого,

то показывается amber notice:

```text
Стиль изменился. При желании можно подобрать другой профиль воды.
```

## 8. Момент активации water setup

Как только пользователь сделал первое meaningful change в шаге 1 или 2, persisted state получает `setupEnabled = true`.

С этого момента в UI появляются:

- `WaterSummaryCard` сверху;
- шаг `3. Как вносить соли`;
- шаг `4. Что добавить`;
- `Расширенные настройки`.

Это и есть фактическая граница между "source/target only" и "full water plan".

## 9. WaterSummaryCard: что реально показывается

`WaterSummaryCard` внутри текущего `WaterSetupWizard` рендерится только если:

```ts
waterPlanMeta.setupEnabled === true
```

Поэтому текст `Вода не настроена`, который есть внутри `WaterSummaryCard`, в текущем rendered flow практически недостижим: сам wizard его не вызывает в disabled state.

Когда вода уже настроена, summary пишет:

- в single mode:

```text
Один объем: X л • pH ~Y • добавки рассчитаны
```

- в split mode:

```text
Затор X л • промывка Y л • pH ~Y • добавки рассчитаны
```

или вместо `добавки рассчитаны`:

```text
без добавок
```

Правила:

- `pH ~Y` показывается только если есть `predictedMashPhAfterAcid20C`;
- additions считаются по факту положительных salts/acid additions;
- acid addition `0 мл` не считается "добавкой".

## 10. Кнопка `Сбросить воду`

Кнопка `Сбросить воду` видна всегда внутри раскрытого блока.

Она вызывает `createRecipeWaterPlanResetMeta()`, который реально чистит state:

- `setupEnabled = false`;
- `sourceProfile = null`;
- `sourceProfilePresetId = null`;
- `sourceProfileSavedId = null`;
- `targetProfile = null`;
- `targetProfilePresetId = null`;
- `targetProfileSlug = null`;
- `targetProfileSavedId = null`;
- `targetProfileName = null`;
- `targetProfileSource = null`;
- `targetProfileIsOverridden = false`;
- `targetProfileResolvedFromBjcpStyleKey = null`;
- `mashWaterVolumeL = null`;
- `spargeWaterVolumeL = null`;
- `totalWaterVolumeL = null`;
- `manualSaltAdditions = []`;
- `spargeAcidificationEnabled = false`;
- `showWaterAdditivesInIngredients = false`;
- `acidConcentrationPct = null`;
- `calibrationOffset = null`;
- `targetMashPh = 5.35`;
- `selectedAcid = "lactic_acid"`;
- `phModel = "hybrid_mash_ph_v1"`.

После reset:

- persisted water flow считается выключенным;
- но UI снова показывает effective display state с `Осмос` как визуальный fallback в шаге 1.

## 11. Шаг 3. Как вносить соли

Шаг виден только после `setupEnabled = true`.

### 11.1. Видимые кнопки

Пользователь видит 2 большие option cards:

- `Считать одним объемом`;
- `Разделить на затор и промывку`.

Подписи у них:

- single mode: текущий total volume в литрах;
- split mode: `Отдельные добавки по объемам`.

### 11.2. Как считается total water

`buildRecipeWaterPlanResult()` берет:

```ts
totalWaterL =
  fallbackBatchVolumeL ?? waterPlanMeta.totalWaterVolumeL ?? 0
```

В реальном `RecipeDesigner` `fallbackBatchVolumeL` приходит из batch size рецепта:

```ts
getBatchVolumeLiters(batchSize.quantity, batchSize.unit)
```

Следствия:

- главный источник total water сейчас — batch size рецепта;
- equipment profile на water volume не влияет;
- потери на кип, trub, absorption, deadspace и т.д. здесь не учитываются;
- water plan оперирует практическим recipe batch volume, а не полным liquor plan.

### 11.3. Что делает `Считать одним объемом`

`setRecipeWaterVolumeMode(..., "single", totalWaterL)` делает:

- `mashWaterVolumeL = null`;
- `spargeWaterVolumeL = null`;
- `totalWaterVolumeL = null`;
- `spargeAcidificationEnabled = false`.

То есть:

- весь water plan считается по общему объему;
- отдельная промывочная кислота выключается автоматически;
- split-specific state убирается.

### 11.4. Что делает `Разделить на затор и промывку`

При первом переключении в split mode:

```ts
mashWaterL = round(totalWaterL * 0.65, 1)
spargeWaterL = round(totalWaterL - mashWaterL, 1)
```

То есть default split сейчас 65/35.

После включения split mode пользователь видит 2 input-а:

- `Заторная вода, л`;
- `Промывочная вода, л`.

Оба поля:

- `type="number"`;
- `step=0.1`;
- допускают пустое значение -> `null`.

### 11.5. Warning по сумме split volumes

Если:

```ts
abs((mashWaterL + spargeWaterL) - totalWaterL) > 0.05
```

показывается warning:

```text
Сумма заторной и промывочной воды отличается от объема партии.
```

Нюанс:

- если batch size потом меняется, а split volumes остались старыми, warning тоже появится;
- автоматической пересборки существующего split под новый batch size нет.

## 12. Шаг 4. Что добавить

Шаг виден только после `setupEnabled = true`.

### 12.1. Верх шага

Слева:

- заголовок `4. Что добавить`;
- строка `Финальный профиль: Ca ... / Mg ... / Na ... / Cl ... / SO4 ... / HCO3 ... ppm`.

Справа:

- compact indicator `SO4:Cl X`.

Если chloride `0`, `sulfateChlorideRatio()` возвращает `null`, и UI показывает `—`.

### 12.2. One-volume mode

В one-volume mode рендерится одна карточка:

- `Добавить в воду`.

Внутри:

- volume label = общий объем в литрах;
- header control = `TargetMashPhField`;
- список солей;
- строка кислоты, если включен mash pH.

### 12.3. Split mode

В split mode рендерятся две карточки:

- `В затор`;
- `В промывку`.

Карточка `В затор` содержит:

- volume label = `mashWaterL`;
- salts = `mashSaltAdditions`;
- acid row = mash acid;
- `TargetMashPhField`.

Карточка `В промывку` содержит:

- volume label = `spargeWaterL`;
- salts = `spargeSaltAdditions`;
- acid row = sparge acid;
- controls для sparge acidification.

### 12.4. Что видно в salt rows

Каждая salt row показывает:

- русское имя соли;
- химическую формулу;
- массу в граммах.

Если salts нет, карточка пишет:

```text
Соли не нужны
```

### 12.5. Как ведет себя acid row

Если acid row показан, справа пользователь видит одно из трех состояний:

- `XX.XX мл`, если кислота нужна;
- `не нужна`, если solver вернул `0 мл`;
- `pH не рассчитан`, если acid row requested, но acid addition отсутствует.

### 12.6. `Рассчитывать pH затора`

`TargetMashPhField` рендерится:

- в single mode внутри `Добавить в воду`;
- в split mode внутри `В затор`.

Это не advanced-control, а часть основного flow.

Содержимое:

- checkbox `Рассчитывать pH затора`;
- если включен:
  - input `Целевой pH затора`;
- если выключен:
  - текст `pH затора не рассчитывается.`

Поведение:

- включение checkbox ставит `targetMashPh = 5.35`;
- выключение checkbox ставит `targetMashPh = null`.

Дополнительный runtime-эффект:

- если pH выключен, effective engine для auto mode становится `profile_only`;
- `spargeAcidificationEnabled` автоматически выключается.

### 12.7. Подкисление промывочной воды

Sparge acid controls показываются только если:

- текущий режим split;
- mash pH вообще включен;
- включен checkbox `Подкислить промывочную воду`.

UI:

- checkbox `Подкислить промывочную воду`;
- input `Исходный pH`;
- input `Целевой pH`.

Defaults:

- `spargeSourcePh ?? sourceProfile.ph ?? 7`;
- `targetSpargePh ?? 5.7`.

Важно:

- если mash pH выключен, весь sparge acid UI скрывается;
- в single mode этого блока нет вообще;
- при переключении обратно в one-volume mode `spargeAcidificationEnabled` сбрасывается в `false`.

### 12.8. Какие warnings реально видит пользователь

В шаге 4 показываются только первые 3 visible warnings:

```ts
waterPlanResult.warnings
  .filter((warning) => !lowPriorityWarnings.has(warning))
  .slice(0, 3)
```

Low-priority warnings, скрытые из UI:

- `mash_ph_ballpark_estimate`;
- `mash_acid_model_practical_approximation`;
- `target_already_reached`.

User-facing warning labels:

| Warning key | UI text |
|---|---|
| `water_split_sum_differs_from_batch_volume` | `Сумма заторной и промывочной воды отличается от объема партии.` |
| `source_profile_missing_or_zero` | `Выберите исходную воду или введите профиль вручную.` |
| `target_profile_missing_or_zero` | `Выберите целевой профиль воды.` |
| `grain_bill_missing_for_mash_ph` | `Для расчета pH нужна засыпь.` |
| `target_not_reached_within_max_acid` | `Целевой pH не достигнут в лимите кислоты.` |
| `calcium_above_practical_range` | `Ca выше практического диапазона.` |
| `magnesium_above_practical_range` | `Mg выше практического диапазона.` |
| `sodium_above_practical_range` | `Na выше практического диапазона.` |
| `chloride_above_practical_range` | `Cl выше практического диапазона.` |
| `sulfate_above_practical_range` | `SO4 выше практического диапазона.` |
| `bicarbonate_above_practical_range` | `HCO3 выше практического диапазона.` |

## 13. Расширенные настройки

Advanced block — вложенный `<details>`, свернут по умолчанию.

Header:

- icon `SlidersHorizontal`;
- title `Расширенные настройки`.

### 13.1. Поля, которые видны всегда

Всегда visible:

- select `Расчет солей`;
- блок `Ручные добавки солей`.

### 13.2. Поля, которые видны только при включенном mash pH

Только если `mashPhEnabled === true`:

- `Модель pH`;
- `Кислота`;
- `Концентрация кислоты, %`;
- `Калибровка pH`.

Если `targetMashPh = null`, эти поля исчезают.

### 13.3. Select `Расчет солей`

UI options:

- `Авторасчет солей`;
- `Ручные добавки солей`.

Внутреннее правило:

```ts
saltCalculationMode =
  effectiveWaterPlanMeta.engine === "advanced_manual" ? "manual" : "auto"
```

То есть:

- `profile_only` визуально все равно показывается как `Авторасчет солей`;
- отдельного видимого режима `Только минерализация` нет;
- отдельного видимого engine selector для `profile_only / balanced_default / advanced_manual` нет.

### 13.4. `Модель pH`

Options:

- `Kolbach RA quick`;
- `Hybrid mash pH v1`.

### 13.5. `Кислота`

Options:

- `Молочная кислота`;
- `Фосфорная кислота`.

### 13.6. `Концентрация кислоты, %`

Input optional:

- если пусто, solver берет default concentration;
- placeholder:
  - `88` для lactic acid;
  - `85` для phosphoric acid.

### 13.7. `Калибровка pH`

Input optional:

- range `-2..2`;
- step `0.01`;
- placeholder `0.00`.

### 13.8. `Ручные добавки солей`

Этот подблок visible всегда, но типичный смысл имеет в `advanced_manual`.

Header:

- title `Ручные добавки солей`;
- button `+ Добавить`.

Важно:

- нажатие `+ Добавить` само переводит engine в `advanced_manual`;
- и добавляет новую строку:

```ts
{ salt: "gypsum", grams: 0 }
```

Строка manual salt row состоит из:

- select соли;
- numeric input grams;
- trash button удаления.

Список options в select сгруппирован:

| Group | Options |
|---|---|
| `Основные` | `Гипс`, `Хлорид кальция (дигидрат)`, `Эпсомская соль` |
| `Опционально` | `Сода пищевая`, `Соль поваренная (не йодированная)` |
| `Только для опытных сценариев` | `Мел (карбонат кальция)`, `Гашёная известь (гидроксид кальция)` |

UI labels:

| Salt id | UI label |
|---|---|
| `gypsum` | `Гипс · CaSO4·2H2O` |
| `calcium_chloride` | `Хлорид кальция (дигидрат) · CaCl2·2H2O` |
| `epsom_salt` | `Эпсомская соль · MgSO4·7H2O` |
| `baking_soda` | `Сода пищевая · NaHCO3` |
| `table_salt` | `Соль поваренная (не йодированная) · NaCl` |
| `chalk` | `Мел (карбонат кальция) · CaCO3` |
| `slaked_lime` | `Гашёная известь (гидроксид кальция) · Ca(OH)2` |

Footer note:

```text
Основной авторасчет держит простой набор солей. Chalk и slaked lime доступны только здесь.
```

## 14. Persistence и storage

### 14.1. Что сохраняется в рецепте

Persisted model:

```ts
waterPlanMeta: RecipeWaterPlanMeta
```

Она хранится в `recipes.water_plan_meta` (`jsonb`).

### 14.2. Что не сохраняется как отдельная сущность

`waterPlanResult` не хранится в БД. Он пересчитывается на лету в `RecipeDesigner`:

```ts
buildRecipeWaterPlanResult({
  waterPlanMeta,
  fallbackBatchVolumeL: getBatchVolumeLiters(batchSize.quantity, batchSize.unit),
  grainKg: getFermentableWeightTotalKg(ingredients),
  beerSrm: preview?.color ?? initialRecipe?.color ?? null,
  fermentables: getFermentablesForWaterPlan(ingredients),
})
```

### 14.3. Что сохраняется только локально в браузере

Saved source/target profiles не идут в recipe payload. Они живут в `localStorage`:

- source key: `nb:recipe-water:source-profiles`;
- target key: `nb:recipe-water:target-profiles`.

Санитизация:

- malformed entries отбрасываются;
- duplicate ids убираются;
- non-negative numeric coercion;
- `ph` допускается только в диапазоне `0..14`;
- хранится максимум `30` профилей.

### 14.4. Важный UX-эффект localStorage

Если:

- `waterPlanMeta.setupEnabled === false`;
- в `localStorage` уже есть saved source profiles,

то на mount wizard автоматически применяет первый saved source profile.

Для target такого auto-apply нет.

## 15. Полная расчетная модель

Ниже описано, как wizard считает volumes, salts, pH и acid additions.

## 16. Входные данные для расчета

`buildRecipeWaterPlanResult()` получает:

- `waterPlanMeta`;
- `fallbackBatchVolumeL`;
- `grainKg`;
- `beerSrm`;
- `fermentables`.

Источники этих данных в `RecipeDesigner`:

| Input | Откуда берется |
|---|---|
| `fallbackBatchVolumeL` | batch size рецепта, конвертированный в литры (`ml/l/gal`) |
| `grainKg` | сумма fermentables, конвертированная в кг (`g/kg/oz/lb`) |
| `beerSrm` | preview color или initial recipe color |
| `fermentables` | только ингредиенты категории `fermentable`, с именем, subtype и weightKg |

Оборудование в water calculation не участвует.

## 17. Расчет объемов

### 17.1. Общий объем

```ts
totalWaterL = roundTo(
  max(0, fallbackBatchVolumeL ?? waterPlanMeta.totalWaterVolumeL ?? 0),
  2
)
```

### 17.2. Определение split mode

`hasManualSplit = mashWaterVolumeL != null || spargeWaterVolumeL != null`

Если split не задан:

- `mashWaterL = totalWaterL`;
- `spargeWaterL = 0`;
- `source = "batch_size"`.

Если split задан:

- `mashWaterL = provided mash or total - sparge`;
- `spargeWaterL = provided sparge or total - mash`;
- `source = "manual_split"`.

## 18. Нормализация source/target profiles

Source и target переводятся в `WaterProfile` с fallback на нули:

```ts
{
  ca: profile?.ca ?? 0,
  mg: profile?.mg ?? 0,
  na: profile?.na ?? 0,
  cl: profile?.cl ?? 0,
  so4: profile?.so4 ?? 0,
  hco3: profile?.hco3 ?? 0,
  ph: profile?.ph ?? null,
}
```

Meaningful profile = хотя бы один из ионов больше 0.

Warnings:

- source без meaningful ions дает `source_profile_missing_or_zero`, кроме специальных low/zero-mineral modes (`ro_distilled`, `distilled`);
- target без meaningful ions дает `target_profile_missing_or_zero`.

## 19. Как считаются соли

### 19.1. Базовая формула ion delta

`applySaltAdditions()` считает вклад каждой соли по mass fractions:

```ts
ppmIonDelta = (saltGrams * 1000 * ionMassFraction) / waterLiters
```

Потом суммирует этот delta по каждому иону и округляет до 3 знаков.

### 19.2. Какие соли доступны auto solver-у

Quick set:

- `gypsum`;
- `calcium_chloride`;
- `epsom_salt`;
- `baking_soda`.

Advanced set:

- все соли из `brewingSaltDefinitions`, включая `table_salt`, `chalk`, `slaked_lime`.

Правило:

- если `allowedSalts` явно заданы, берутся они;
- иначе:
  - `advanced_manual` -> полный набор;
  - любой auto engine -> quick set.

### 19.3. Когда запускается auto solver

Auto solver работает, если одновременно:

- engine не `advanced_manual`;
- target profile meaningful;
- `totalWaterL > 0`.

Если это не так:

- auto solver не запускается;
- список auto salts = `[]`.

### 19.4. Как работает target solver

`solveWaterTargetProfile()` — это greedy practical solver, не linear programming и не лабораторный water engine.

Алгоритм:

1. start с нулевых additions;
2. считает score между final profile и target;
3. проходит allowed salts в 3 прохода по шагам:
   - `1 г`;
   - `0.25 г`;
   - `0.05 г`;
4. на каждом шаге пытается добавить соль, если это улучшает score;
5. лимит на одну соль по умолчанию `20 г`;
6. guard limit `400` итераций на шаг.

Score profile:

- `ca` weight `2`;
- `mg` weight `1`;
- `na` weight `1`;
- `cl` weight `2`;
- `so4` weight `2`;
- `hco3` weight `2`.

Score = сумма квадратов отклонений, умноженных на веса.

### 19.5. Manual salts

Если effective engine = `advanced_manual`, используются только `manualSaltAdditions`.

Важно:

- пустой manual salt list не запускает auto solver;
- это означает "без солей", а не fallback в auto mode.

### 19.6. Как total salts делятся между mash и sparge

Сначала все salts считаются на `totalWaterL`.

Потом, если UI split:

```ts
ratio = mashWaterL / (mashWaterL + spargeWaterL)
ratio = spargeWaterL / (mashWaterL + spargeWaterL)
```

И каждое total addition пропорционально режется в:

- `mashSaltAdditions`;
- `spargeSaltAdditions`.

То есть:

- solver сам по себе не решает затор и промывку отдельно;
- split в текущей реализации — это proportional presentation/splitting уже рассчитанного общего набора солей.

## 20. Финальный профиль, ratio и residual alkalinity

`finalProfile`:

- если `totalWaterL > 0`: это `sourceProfile + salt additions`;
- иначе: просто `sourceProfile`.

Дополнительно считаются:

- `sulfateChlorideRatio = so4 / cl`, если `cl > 0`, иначе `null`;
- `alkalinityAsCaCO3FromHco3 = hco3 * 50 / 61`;
- `residualAlkalinityAsCaCO3 = alkalinityAsCaCO3 - (ca / 1.4 + mg / 1.7)`.

## 21. Классификация засыпи для mash pH

Перед pH estimate fermentables сводятся в проценты категорий:

- `pctNonRoastedSpecialty`;
- `pctRoasted`;
- `pctCrystalCaramel`;
- `pctAcidulated`.

Классификация идет по `name + subtype`, по простому string matching:

- `acidulated`, `sour` -> acidulated;
- `roast`, `black`, `chocolate` -> roasted;
- `crystal`, `caramel`, `cara` -> crystal;
- `adjunct`, `sugar`, `rice`, `corn` -> adjunct;
- иначе -> base.

## 22. Когда mash pH вообще считается

`mashPhEstimate = null`, если выполнено хотя бы одно:

- `targetMashPh == null`;
- `grainKg <= 0`;
- `mashWaterL <= 0`.

Дополнительно warning:

- если pH requested, но `grainKg <= 0`, добавляется `grain_bill_missing_for_mash_ph`.

## 23. Модели mash pH

### 23.1. Kolbach RA quick

```ts
ra = residualAlkalinityAsCaCO3(profile)
raShift = 0.00168 * ra
predictedMashPh20C = baseMaltDiPh + raShift + calibrationOffset
```

Defaults:

- `baseMaltDiPh = 5.7`;
- `calibrationOffset = 0`, если не задан.

Всегда добавляет warning:

- `mash_ph_ballpark_estimate`.

### 23.2. Hybrid mash pH v1

База:

```ts
predicted =
  baseMaltDiPh
  + raShift
  + thicknessAdjustment
  + colorShift
  + specialtyMaltClassAdjustment
  + acidulatedMaltAdjustment
  + mineralAdjustment
  + calibrationOffset
```

Где:

- `baseMaltDiPh = 5.7` по умолчанию;
- `raShift = 0.00168 * RA`;
- `mashThickness = mashWaterLiters / grainKg`, fallback `3`;
- `thicknessAdjustment = clamp((mashThickness - 3) * 0.01, -0.03, 0.03)`;
- `plato` сейчас effectively фиксирован как `12`;
- `colorShift` зависит от `beerSrm`, `pctNonRoastedSpecialty`, `pctRoasted`;
- `specialtyMaltClassAdjustment = -0.08 * crystalShare - 0.18 * roastedShare`;
- `acidulatedMaltAdjustment = -0.1 * pctAcidulated`;
- `mineralAdjustment = clamp(((ca + mg) - 80) / 1000, -0.06, 0.03)`.

Модель тоже всегда добавляет:

- `mash_ph_ballpark_estimate`.

Это practical approximation, а не полноценная mash chemistry model.

## 24. Как считается кислота

### 24.1. Выбор кислоты

`resolveAcid()` использует:

1. `selectedAcid`, если она валидна;
2. иначе первый allowed acid;
3. иначе fallback `lactic_acid`.

### 24.2. Defaults по концентрации

Если `acidConcentrationPct` пустой:

- `lactic_acid -> 88%`;
- `phosphoric_acid -> 85%`.

### 24.3. Neutralization strength

```ts
acidMeqPerMl =
  densityGPerMl
  * concentrationFraction
  / molecularWeightGPerMol
  * effectiveProtons
  * 1000
```

### 24.4. Practical pH drop model

Для оценки pH после кислоты используется:

```ts
acidMeq = acidNeutralizationMeqPerMl(...) * acidMl
alkalinityMeq = alkalinityAsCaCO3 * mashWaterLiters / 50
practicalBufferMeqPerPh =
  max(20, grainKg * 40 + mashWaterLiters * 2 + alkalinityMeq * 2)
phDrop = acidMeq / practicalBufferMeqPerPh
predictedPh = unadjustedPh - phDrop
```

### 24.5. Mash acid solver

`solveMashAcidAddition()`:

- делает binary search;
- `40` итераций;
- диапазон `0..maxMl`;
- `maxMl = max(5, mashWaterLiters * 2)` по умолчанию.

Если исходный pH уже <= target:

- solver сразу возвращает `0 мл`;
- добавляет warning `target_already_reached`.

Если даже на `maxMl` target не достигнут:

- warning `target_not_reached_within_max_acid`.

Во всех случаях solver добавляет:

- `mash_acid_model_practical_approximation`.

### 24.6. Mash acid addition

Для mash solver получает:

- `unadjustedMashPh20C = mashPhEstimate.predictedMashPh20C`;
- `targetMashPh20C = targetMashPh`;
- `mashWaterLiters = mashWaterL`;
- `grainKg = grainKg`;
- `alkalinityAsCaCO3 = alkalinityAsCaCO3FromHco3(finalProfile.hco3)`;
- выбранную кислоту и концентрацию.

### 24.7. Sparge acid addition

Для sparge используется тот же solver, но с другими inputs:

- `unadjustedMashPh20C = spargeSourcePh`;
- `targetMashPh20C = targetSpargePh`;
- `mashWaterLiters = spargeWaterL`;
- `grainKg = 0`;
- `alkalinityAsCaCO3 = targetSpargeAlkalinity ?? alkalinityAsCaCO3FromHco3(sourceProfile.hco3)`.

То есть sparge acidification в текущей реализации:

- не использует grist;
- ориентируется на source water pH и alkalinity;
- остается practical approximation.

## 25. Итоговый predicted mash pH

`predictedMashPhAfterAcid20C`:

- если есть `mashAcidAddition`, берется его `predictedMashPh20C`;
- иначе, если есть `mashPhEstimate`, берется unadjusted estimate;
- иначе `null`.

Это значение идет в summary-card и в основной UX как главный pH output.

## 26. Practical range warnings для финального профиля

Thresholds:

- `Ca > 250` -> warning;
- `Mg > 40` -> warning;
- `Na > 150` -> warning;
- `Cl > 250` -> warning;
- `SO4 > 350` -> warning;
- `HCO3 > 250` -> warning.

## 27. Legacy compatibility

Совместимость, которая реально сохранена:

- `recipeWaterPlanMetaSchema` не ломает старые записи;
- legacy target modes `balanced`, `malty`, `hoppy`, `style` все еще парсятся schema-слоем;
- `ensureRecipeWaterPlanConfigured()` нормализует эти modes в `catalog`;
- старые persisted профили не теряются;
- `builtInTargetWaterProfiles` остаются в коде для compatibility/older flows;
- `showWaterAdditivesInIngredients` остается в schema и persistence.

## 28. Что есть в schema/code, но не выведено в текущий UI

Сейчас не показаны или не задействованы в rendered water flow:

- `showWaterAdditivesInIngredients` — скрыто, line mirroring в ingredients нет;
- `blendRatio` — есть в schema, нет UI;
- `targetSpargeAlkalinity` — есть в schema, нет отдельного UI поля;
- `totalWaterVolumeL` — есть в schema, но normal flow питается от batch size;
- historical source presets `Pilsen`, `Dublin`, `Munich` — есть в данных, не рендерятся;
- searchable source selector helper — есть в файле, не используется;
- `WaterSummaryCard` empty state `Вода не настроена` — есть в компоненте, но не рендерится из текущего wizard flow;
- `autoSelectDefault` в style-default seed читается, но не управляет actual auto-select effect.

## 29. Что пользователь может сделать от начала до конца

Полный перечень user actions в текущем water flow:

1. Раскрыть/свернуть блок `Вода`.
2. Нажать `Сбросить воду`.
3. Выбрать source:
   - `Сохраненный профиль`;
   - `Осмос`;
   - `Дистиллированная вода`;
   - `Вручную`.
4. Отредактировать source ions:
   - `Ca`, `Mg`, `Na`, `Cl`, `SO4`, `HCO3`.
5. Сохранить manual source profile:
   - `Сохранить`;
   - `ОК`;
   - `Отмена`.
6. Удалить saved source profile через trash icon.
7. Выбрать target:
   - `Сохраненный профиль`;
   - `Поиск`;
   - `Вручную`.
8. Искать target profile по каталогу.
9. Выбрать target из suggested/quick-pick/search results.
10. Нажать `Изменить` у выбранного catalog target.
11. Отредактировать target ions:
   - `Ca`, `Mg`, `Na`, `Cl`, `SO4`, `HCO3`.
12. Сохранить manual target profile:
   - `Сохранить`;
   - `ОК`;
   - `Отмена`.
13. Удалить saved target profile через trash icon.
14. Выбрать volume mode:
   - `Считать одним объемом`;
   - `Разделить на затор и промывку`.
15. В split mode вручную задать:
   - `Заторная вода, л`;
   - `Промывочная вода, л`.
16. Включить/выключить:
   - `Рассчитывать pH затора`.
17. Изменить:
   - `Целевой pH затора`.
18. В split mode включить/выключить:
   - `Подкислить промывочную воду`.
19. В split mode изменить:
   - `Исходный pH`;
   - `Целевой pH`.
20. Открыть `Расширенные настройки`.
21. Переключить `Расчет солей`:
   - `Авторасчет солей`;
   - `Ручные добавки солей`.
22. При включенном mash pH изменить:
   - `Модель pH`;
   - `Кислота`;
   - `Концентрация кислоты, %`;
   - `Калибровка pH`.
23. В manual salts:
   - `+ Добавить`;
   - выбрать соль в `select`;
   - изменить `grams`;
   - удалить строку trash-button.

## 30. Короткий вывод

Текущий water flow в recipe master — это уже не "включить модуль воды", а встроенный progressive editor:

- сначала source/target;
- затем volume split;
- затем live result;
- затем advanced tuning.

Но при этом важно не переоценивать точность:

- water plan опирается на batch size, а не на полноценный liquor plan;
- salt solver greedy/practical;
- mash pH и acid solver тоже practical approximations;
- часть schema уже подготовлена под более глубокий water domain, но в текущем UI еще не выведена.

С точки зрения фактического поведения текущий документ теперь должен считаться более точным, чем старые описания с `Настроить воду`, historical source picker на первом экране и placeholder-логикой saved profiles.
