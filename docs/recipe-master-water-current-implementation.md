# Вода и водоподготовка в мастере рецептов

Документ описывает текущий water flow после переработки блока `Вода` в мастере рецептов. Код важнее документа; основные источники:

- `apps/web/components/recipes/water-setup-wizard.tsx`;
- `apps/web/components/recipes/water-summary-card.tsx`;
- `apps/web/features/recipes/water-plan.ts`;
- `apps/web/features/recipes/water-profile-presets.ts`;
- `apps/web/features/recipes/contracts.ts`;
- `packages/brewing-core/src/calculations/water.ts`.

## 1. Продуктовая модель

Главный сценарий теперь построен как:

```text
SOURCE PROFILE -> TARGET PROFILE -> SPLIT MODE -> ADDITIONS RESULT
```

UI больше не начинается с отдельного вопроса `Настроить водоподготовку?`. Если вода не настроена, пользователь видит короткое состояние `Вода не настроена` и CTA `Настроить воду`. После включения flow сразу открывается последовательность:

1. `Исходная вода`;
2. `Целевой профиль`;
3. `Как вносить соли`;
4. `Что добавить`;
5. collapsed `Расширенные настройки`.

Основной экран не показывает внутренние технические id, не обещает неработающий style auto-pick и не выводит `showWaterAdditivesInIngredients`, потому что mirror-to-ingredients пока не реализован.

## 2. Persistence

Блок по-прежнему использует существующую persisted model:

```ts
waterPlanMeta: RecipeWaterPlanMeta
```

Нового storage/domain layer нет.

`waterPlanMeta` входит в общий payload рецепта и сохраняется в `recipes.water_plan_meta` как `jsonb`. Расчетный `waterPlanResult` не сохраняется, а пересчитывается в `RecipeDesigner` через:

```ts
buildRecipeWaterPlanResult({
  waterPlanMeta,
  fallbackBatchVolumeL: getBatchVolumeLiters(batchSize.quantity, batchSize.unit),
  grainKg: getFermentableWeightTotalKg(ingredients),
  beerSrm: preview?.color ?? initialRecipe?.color ?? null,
  fermentables: getFermentablesForWaterPlan(ingredients)
})
```

Batch size рецепта остается главным источником total water volume. Профиль оборудования на water plan не влияет.

## 3. Reset / Setup

Для явного сброса используется `createRecipeWaterPlanResetMeta()`.

Reset реально очищает relevant state:

- `setupEnabled = false`;
- `sourceProfile = null`;
- `sourceProfilePresetId = null`;
- `targetProfile = null`;
- `targetProfilePresetId = null`;
- `mashWaterVolumeL = null`;
- `spargeWaterVolumeL = null`;
- `manualSaltAdditions = []`;
- `spargeAcidificationEnabled = false`;
- `showWaterAdditivesInIngredients = false`;
- advanced calibration/acid fields сбрасываются к безопасным значениям.

Это устраняет старый ghost-state, когда `Пока нет` только скрывал блок, но оставлял старые профили и добавки в summary.

Начальное включение идет через `ensureRecipeWaterPlanConfigured()`:

- source fallback: `RO / Дистиллят`;
- target fallback: `Balanced Ale`;
- salt calculation fallback: `Авторасчет солей`;
- mash pH calculation включен по умолчанию через `targetMashPh = 5.35`;
- default acid: `Молочная кислота`;
- старые рецепты с уже сохраненными профилями не теряют `sourceProfile`/`targetProfile`;
- legacy `targetProfileMode = "style"` нормализуется в UI к обычному режиму без показа неработающего `По стилю`.

То есть default настроенного блока воды после `Настроить воду`:

```ts
engine = "balanced_default"
targetMashPh = 5.35
selectedAcid = "lactic_acid"
manualSaltAdditions = []
```

В UI это выглядит как:

```text
Расчет солей: Авторасчет солей
Рассчитывать pH затора: включено
Целевой pH затора: 5.35
```

## 4. Summary

`WaterSummaryCard` теперь считает воду настроенной только по `setupEnabled`.

Если не настроено:

```text
Вода не настроена
```

Если один объем:

```text
Один объем: X л • pH ~Y • добавки рассчитаны
```

Если split:

```text
Затор X л • промывка Y л • pH ~Y • добавки рассчитаны
```

pH добавляется только если расчет доступен. Если положительных солей/кислот нет, summary пишет `без добавок`.

## 5. Source Profile

Первый шаг — `Исходная вода`.

Главный selector — searchable profile selector:

- закрытое состояние показывает название и краткий ion summary;
- раскрытое состояние показывает search input;
- список профилей показывает название, описание, badge и ions preview;
- поиск работает по названию, описанию, badge, tags и ion summary.

Primary source path:

- `RO / Дистиллят`;
- `Ввести вручную`;
- placeholder под будущий `Сохраненный профиль воды`.

City/historical examples (`Pilsen`, `Dublin`, `Munich`) спрятаны в secondary section `Примерные исторические профили`, а не торчат на первом экране.

`RO / Дистиллят` считается валидным zero-mineral source. В `buildRecipeWaterPlanResult()` warning `source_profile_missing_or_zero` больше не добавляется, если source mode/preset явно `ro_distilled`.

Manual source profile редактирует:

- `Ca`;
- `Mg`;
- `Na`;
- `Cl`;
- `SO4`;
- `HCO3`.

## 6. Target Profile

Второй шаг — `Целевой профиль`.

Основной путь — searchable picker по target profiles. Текущий seed уже структурно готов под большой каталог.

Текущие built-in targets:

| Id | Name | Назначение |
|---|---|---|
| `balanced` | Balanced Ale | универсальный старт |
| `neipa` | NEIPA / Hazy IPA | мягкий хлоридный hoppy profile |
| `west_coast_ipa` | West Coast IPA | сульфатный сухой hoppy profile |
| `pilsner` | Pilsner | чистый светлый lager profile |
| `helles` | Helles | мягкий солодовый lager profile |
| `dubbel` | Dubbel | темный бельгийский профиль |
| `stout` | Stout | темная засыпь / повышенная щелочность |
| `light_malty` | Light & Malty | compatibility preset |
| `light_hoppy` | Light & Hoppy | compatibility preset |

`По стилю` больше не показывается как CTA, потому что реального style-based target selection еще нет.

Manual target profile остается отдельной кнопкой `Задать цель вручную`.

## 7. Split Mode

Третий шаг — центральный переключатель:

- `Считать одним объемом`;
- `Разделить на затор и промывку`.

One-volume mode:

```ts
mashWaterVolumeL = null
spargeWaterVolumeL = null
totalWaterVolumeL = null
spargeAcidificationEnabled = false
```

Split mode при первом включении делит total water:

```text
mashWaterL = round(totalWaterL * 0.65, 1)
spargeWaterL = round(totalWaterL - mashWaterL, 1)
```

Пользователь может вручную менять `Заторная вода, л` и `Промывочная вода, л`.

Если сумма split отличается от batch size больше чем на `0.05 л`, показывается компактный warning:

```text
Сумма заторной и промывочной воды отличается от объема партии.
```

## 8. Additions Result

Четвертый шаг — главный визуальный результат.

В one-volume mode показывается одна карточка:

```text
Добавить в воду
```

В split mode показываются две карточки:

```text
В затор
В промывку
```

Каждая карточка показывает:

- объем;
- список солей `русское название + формула + grams`;
- кислоту, если она релевантна для этой карточки.

Если соль не нужна, строка пишет `Соли не нужны`.

Кислота:

- для затора показывается в карточке `Добавить в воду` или `В затор`;
- для промывки показывается только в карточке `В промывку` и только если включено `Подкислить промывочную воду`.

`Целевой pH затора` больше не находится в advanced:

- в one-volume mode он находится в карточке `Добавить в воду`, под общим объемом воды;
- в split mode он находится в карточке `В затор`, под объемом заторной воды.
- у поля есть checkbox `Рассчитывать pH затора`; если он выключен, `targetMashPh = null`, pH/кислота не считаются.

Sparge acid controls теперь находятся внутри карточки промывки:

- checkbox `Подкислить промывочную воду`;
- `Исходный pH`;
- `Целевой pH`.

## 9. Advanced

`Расширенные настройки` по умолчанию свернуты.

Внутри:

- `Расчет солей`: `Авторасчет солей` или `Ручные добавки солей`;
- `Модель pH`, только если включен расчет pH затора;
- `Кислота`, только если включен расчет pH затора;
- `Концентрация кислоты, %`, только если включен расчет pH затора;
- `Калибровка pH`, только если включен расчет pH затора;
- `Ручные добавки солей`.

Технический выбор между `profile_only` и `balanced_default` больше не показывается пользователю. Он выводится из `targetMashPh`:

```ts
targetMashPh == null ? "profile_only" : "balanced_default"
```

Исключение — `advanced_manual`: он остается отдельным режимом только для ручных солей и не означает обязательный расчет pH. Если пользователь выбрал `Ручные добавки солей`, pH все равно включается/выключается только checkbox-ом `Рассчитывать pH затора`.

UI value для advanced select считается так:

```ts
waterPlanMeta.engine === "advanced_manual" ? "manual" : "auto"
```

Default value этого select — `auto`, потому что новый configured/reset state использует `engine = "balanced_default"`, а не `advanced_manual`.

`showWaterAdditivesInIngredients` не выводится в UI, потому что сейчас это только persisted preference и оно не создает line items.

Manual salts теперь можно нормально удалить кнопкой с trash icon. Строку больше не нужно обнулять.

Соли отображаются пользовательскими названиями из seed водоподготовки с формулами:

| Salt id | UI label |
|---|---|
| `gypsum` | `Гипс · CaSO4·2H2O` |
| `calcium_chloride` | `Хлорид кальция (дигидрат) · CaCl2·2H2O` |
| `epsom_salt` | `Эпсомская соль · MgSO4·7H2O` |
| `baking_soda` | `Сода пищевая · NaHCO3` |
| `table_salt` | `Соль поваренная (не йодированная) · NaCl` |
| `chalk` | `Мел (карбонат кальция) · CaCO3` |
| `slaked_lime` | `Гашёная известь (гидроксид кальция) · Ca(OH)2` |

Соли в manual UI сгруппированы:

| Группа | Соли |
|---|---|
| Основные | `gypsum`, `calcium_chloride`, `epsom_salt` |
| Опционально | `baking_soda`, `table_salt` |
| Только для опытных сценариев | `chalk`, `slaked_lime` |

Auto solver compatibility сохранена: базовый расчет по-прежнему может использовать текущий quick salts set в `water-plan.ts`, но main UI не вываливает редкие соли в основной сценарий.

## 10. Расчет солей

Расчет идет через `buildRecipeWaterPlanResult()` и `@nb/brewing-core`.

Auto solver запускается, если:

- effective salt mode не `advanced_manual`;
- есть meaningful target profile;
- `totalWaterL > 0`.

Manual salt additions используются, если:

```ts
effectiveEngine === "advanced_manual"
```

В manual salt mode пустой `manualSaltAdditions` означает `без солей`, а не fallback в auto solver.

Общий список солей считается на `totalWaterL`, затем делится между затором и промывкой пропорционально объемам.

## 11. pH и кислота

Mash pH не считается, если:

- `targetMashPh == null`;
- `grainKg <= 0`;
- `mashWaterL <= 0`.

pH calculation не зависит от выбора auto/manual salts. Например:

- `Авторасчет солей` + `Рассчитывать pH затора` включено -> соли считаются автоматически, pH/кислота считаются;
- `Авторасчет солей` + `Рассчитывать pH затора` выключено -> считается только минерализация;
- `Ручные добавки солей` + `Рассчитывать pH затора` включено -> используются только ручные соли, pH/кислота считаются;
- `Ручные добавки солей` + `Рассчитывать pH затора` выключено -> используются только ручные соли, pH/кислота не считаются.

Модели:

- `kolbach_ra_quick`;
- `hybrid_mash_ph_v1`.

Кислоты:

- `lactic_acid` -> `Молочная кислота`;
- `phosphoric_acid` -> `Фосфорная кислота`.

Default concentration:

- молочная: `88%`;
- фосфорная: `85%`.

Кислота считается practical solver через `solveMashAcidAddition()`. Это приближение, не лабораторная acid-base simulation.

## 12. Warnings

В основном UI показываются только actionable warnings. Low-priority technical warnings скрыты:

- `mash_ph_ballpark_estimate`;
- `mash_acid_model_practical_approximation`;
- `target_already_reached`.

Остаются компактные предупреждения:

- split сумма не совпадает с batch size;
- не выбран source/target;
- нет засыпи для pH;
- pH не достигнут в лимите кислоты;
- practical range warnings по ионам.

## 13. Совместимость

Сохранена совместимость с существующими рецептами:

- schema `recipeWaterPlanMetaSchema` не менялась;
- старые target ids `balanced`, `light_malty`, `light_hoppy` сохранены;
- historical source presets сохранены;
- `targetProfileMode = "style"` продолжает парситься, но больше не показывается как primary action;
- `showWaterAdditivesInIngredients` остается в persisted meta, но скрыт из UI;
- water plan volume по-прежнему идет от batch size рецепта.

## 14. Что не реализовано

- Пользовательские saved water profiles пока только placeholder в UI.
- Реальный style-based target picker не реализован.
- Mirror water additions to recipe ingredients не реализован.
- Blend tap/RO/distilled ratio есть в schema, но не используется в UI.
- Equipment volume plan не участвует в water plan.
