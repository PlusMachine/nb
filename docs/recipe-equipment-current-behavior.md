# Оборудование в мастере рецептов

Дата проверки: 2026-04-22.

Документ описывает текущее фактическое поведение связи мастера рецептов, `/app/equipment` и water setup.

## Короткий вывод

В мастере рецептов больше нет отдельного блока `Оборудование`.

В блоке `Параметры партии` есть явный select `Оборудование`.

Основной профиль оборудования из `/app/equipment` выбирается по умолчанию при создании нового рецепта:

- `targetBatchVolumeL` подставляется в верхний `Объём`;
- `brewhouseEfficiencyPct` подставляется в верхнюю `Эффективность, %`;
- выбранный профиль виден в select рядом с `Объём / Эффективность / Кипячение`.

Пользователь может выбрать другой сохраненный профиль. При выборе профиля мастер копирует из него типичный объем и эффективность в поля рецепта. Пункт `Без профиля` убирает привязку к профилю.

После подстановки источником истины остаются поля самого рецепта. Если пользователь меняет `Объём`, `Эффективность` или `Кипячение` в мастере, меняется только рецепт. Профиль оборудования на `/app/equipment` от этого не мутирует.

Water setup теперь не является equipment volume plan. Он считает минерализацию воды по общему объему из размера партии рецепта и может вручную разделить этот объем на заторную и промывочную воду.

## Где это находится в коде

- `apps/web/components/recipes/recipe-designer.tsx` - UI мастера рецептов, верхние поля партии, provenance профиля, вызов water setup.
- `apps/web/components/recipes/water-setup-wizard.tsx` - UI пошаговой настройки воды и split `заторная / промывочная`.
- `apps/web/features/recipes/water-plan.ts` - расчет минерализации, pH, солей и кислот.
- `apps/web/features/recipes/service.ts` - сохранение рецепта и расчет OG/FG/ABV/IBU/цвета.
- `apps/web/features/equipment-profiles/contracts.ts` - schema payload/snapshot профиля оборудования.
- `apps/web/features/equipment-profiles/service.ts` - CRUD профилей и построение snapshot.
- `apps/web/components/equipment/equipment-profile-form-basic.tsx` - видимая форма `/app/equipment`.
- `packages/db/src/schema.ts` - таблицы `equipment_profiles`, `recipes`, `brew_batches`.

## `/app/equipment`

Профили оборудования хранятся отдельно от рецептов. Один профиль может быть помечен как `Основной`.

Страница показывает:

- количество профилей и имя основного профиля;
- кнопку `Создать профиль`;
- карточки профилей с метриками `Типичный объем партии`, `Эффективность`, `Испарение`;
- actions `Редактировать`, `Дублировать`, `Сделать основным`, `Удалить`.

`listEquipmentProfiles` сортирует профили так, что основной идет первым, затем по `updatedAt desc`.

Первый созданный профиль автоматически становится основным. Если удалить основной профиль, сервис выбирает замену из оставшихся профилей по последнему `updatedAt`.

## Поля профиля оборудования

Схемы профиля оборудования теперь содержат только поля, которые явно присутствуют в мастере оборудования.

| Поле | Что означает | Где используется сейчас |
| --- | --- | --- |
| `name` | Название профиля | UI, snapshot/provenance рецепта |
| `targetBatchVolumeL` | Типичный объем партии профиля | Стартовый `Объём` нового рецепта из основного профиля; подстановка при выборе профиля; summary карточки |
| `brewhouseEfficiencyPct` | Типичная эффективность варки | Стартовая `Эффективность` нового рецепта из основного профиля; подстановка при выборе профиля; summary карточки |
| `evaporationRateLPerHr` | Испарение в час | Summary карточки, equipment volume summary в профиле |
| `trubChillerLossL` | Потери в котле / на чиллере | Equipment volume summary в профиле |
| `fermenterLossL` | Потери в ферментере | Хранение/UI профиля |
| `grainAbsorptionLPerKg` | Поглощение воды зерном | Equipment volume summary в профиле |
| `coolingShrinkagePct` | Усадка при охлаждении | Equipment volume summary в профиле |
| `mashThicknessLPerKg` | Гидромодуль | Equipment volume summary в профиле |
| `maxMashVolumeL` | Лимит заторника | Warning equipment summary в профиле |
| `maxKettleVolumeL` | Лимит котла | Warning equipment summary в профиле |
| `hopUtilizationFactor` | Калибровка утилизации хмеля | Хранение/UI профиля; больше не драйвит IBU рецепта |
| `altitudeM` | Высота над уровнем моря | Хранение/UI профиля; больше не драйвит IBU рецепта |
| `isDefault` | Основной профиль пользователя | Профиль, выбранный по умолчанию в новом рецепте |
| `notes` | Заметки | Только хранение/UI |

Удалены из app-схем и из таблицы `equipment_profiles` миграцией `0028_equipment_profile_visible_fields.sql`:

- `brewMethod`;
- `boilTimeMin`;
- `mashEfficiencyPct`;
- `mashTunDeadspaceL`;
- `spargeVesselDeadspaceL`;
- `topUpWaterL`.

Эти поля больше не должны попадать в payload создания/обновления профиля и в новый equipment snapshot.

## Мастер рецептов

Наверху рецепта пользователь видит блок `Параметры партии`:

- расчетные карточки: цвет, OG/НП, FG/КП, IBU, ABV, стиль;
- поля `Объём`, `Эффективность, %`, `Кипячение, мин`.

Эти поля входят в payload рецепта и autosave:

- `Объём` -> `batchSizeEnteredQuantity` + `batchSizeEnteredUnit`;
- `Эффективность` -> `efficiency`;
- `Кипячение` -> `boilTimeMinutes`.

Если новый рецепт открывается при наличии основного профиля оборудования, мастер выбирает его в select `Оборудование` и берет из него стартовые значения `Объём` и `Эффективность`. Если основного нет, берется первый профиль из списка. Если профилей нет, используются fallback `20 л` и `75%`, а select показывает `Без профиля`.

В нижней части блока `Параметры партии` пользователь видит:

- select `Оборудование`;
- пункт `Без профиля — ручной ввод параметров`;
- закрытый select показывает короткое текущее значение: `Без профиля` или имя выбранного профиля;
- раскрытый список показывает сохраненные профили summary-строкой: имя, `Основной` для основного профиля, объем и эффективность.

Для уже существующего рецепта используются сохраненные значения самого рецепта и сохраненный `equipmentProfileId`, если он есть. Изменение основного профиля на `/app/equipment` не переписывает существующие рецепты автоматически.

## `equipmentProfileId` и `equipmentProfileSnapshot` в рецепте

В `recipes` поля `equipmentProfileId` и `equipmentProfileSnapshot` пока остаются:

- для provenance: показать, от какого профиля были взяты стартовые параметры;
- для совместимости сохраненных рецептов, партий и snapshot-данных.

В текущем мастере есть UI выбора профиля в блоке `Параметры партии`. При выборе сохраненного профиля обновляются `equipmentProfileId`, `equipmentProfileSnapshot`, верхний `Объём` и верхняя `Эффективность`.

Отдельной кнопки обновления snapshot и отдельного масштабирования рецепта под профиль нет. Расчеты рецепта не читают equipment snapshot как источник volume plan или IBU modifiers.

Если старый рецепт содержит snapshot со старыми ключами, новые схемы принимают только актуальный набор полей. Лишние старые ключи не должны использоваться новой логикой.

## Расчеты рецепта

### OG / НП

OG считается из:

- fermentables;
- верхнего batch volume рецепта;
- верхней `efficiency` рецепта или fallback `75`.

Equipment profile напрямую OG не меняет после создания рецепта.

### FG / КП

FG считается из:

- OG;
- yeast attenuation;
- mash profile;
- manual attenuation override или manual FG override из `calculationMeta`.

Equipment profile напрямую FG не меняет.

### ABV

ABV считается из OG и FG. Equipment profile напрямую ABV не меняет.

### Цвет

Цвет считается из fermentables и верхнего batch volume рецепта. Equipment profile напрямую цвет не меняет.

### IBU

IBU считается из:

- OG;
- верхнего batch volume рецепта;
- верхнего `boilTimeMinutes`;
- hop additions;
- `calculationMeta.bitternessFormula`;
- `calculationMeta.bitternessSettings`.

Equipment snapshot больше не передает в IBU расчет `preBoilVolumeL`, `postBoilVolumeL`, `hopUtilizationFactor` или `altitudeM`. Сейчас используются:

- `preBoilVolumeL = null`;
- `postBoilVolumeL = batchVolumeL`;
- `hopUtilizationFactor = 1`;
- `altitudeM = 0`.

## Water setup

Water setup - это пошаговая настройка минерализации воды, а не расчет полного объема воды под оборудование.

Объем для минерализации берется из размера партии рецепта:

- `totalWaterL = batchSize` в литрах;
- если `batchSize` недоступен, fallback - legacy `waterPlanMeta.totalWaterVolumeL`;
- если split не включен, весь объем считается заторной водой, `spargeWaterL = 0`;
- если нажать `Разбить объем`, мастер создает ручной split `mashWaterVolumeL / spargeWaterVolumeL`;
- если сумма split отличается от размера партии, появляется warning `water_split_sum_differs_from_batch_volume`.

Соли считаются на общий объем. При split итоговые добавки делятся между заторной и промывочной водой пропорционально их объемам. Кислота в промывку считается только если включена acidification промывки и `spargeWaterL > 0`.

Профиль оборудования на этот water plan не влияет.

## Ответ по старому списку полей water/volume plan

Старый список:

- `targetBatchVolumeL`;
- `boilTimeMin`;
- `evaporationRateLPerHr`;
- `trubChillerLossL`;
- `mashTunDeadspaceL`;
- `spargeVesselDeadspaceL`;
- `grainAbsorptionLPerKg`;
- `coolingShrinkagePct`;
- `topUpWaterL`;
- `mashThicknessLPerKg`;
- `maxMashVolumeL`;
- `maxKettleVolumeL`;
- `brewMethod`.

Это больше не список полей, влияющих на water plan в мастере рецепта.

Сейчас:

- water setup в рецепте зависит от `Объём` рецепта и ручного split `mashWaterVolumeL / spargeWaterVolumeL`;
- `targetBatchVolumeL` влияет на стартовый `Объём` нового рецепта и на `Объём` при явном выборе профиля в мастере;
- `brewhouseEfficiencyPct` влияет на стартовую `Эффективность` нового рецепта и на `Эффективность` при явном выборе профиля в мастере;
- `boilTimeMin`, `mashTunDeadspaceL`, `spargeVesselDeadspaceL`, `topUpWaterL`, `brewMethod`, `mashEfficiencyPct` удалены из equipment profile schema;
- `evaporationRateLPerHr`, `trubChillerLossL`, `grainAbsorptionLPerKg`, `coolingShrinkagePct`, `mashThicknessLPerKg`, `maxMashVolumeL`, `maxKettleVolumeL` могут участвовать только в equipment summary/diagnostics самого профиля, но не в water setup рецепта.

## BeerXML export/import

Export:

- `BATCH_SIZE` берется из верхнего объема рецепта;
- `BOIL_TIME` берется из верхнего `boilTimeMinutes`;
- `EFFICIENCY` берется из верхней эффективности рецепта;
- `TYPE` сейчас экспортируется как `All Grain`;
- `BOIL_SIZE` сейчас не экспортируется из equipment volume plan.

Import:

- BeerXML/Brewfather импортируют batch size, boil time, efficiency в верхние поля рецепта;
- equipment profile snapshot из импортируемого файла не создается.

## Start brew / партии

При `Начать варку` создается `brew_batches`.

В batch по-прежнему сохраняются:

- `brewPlanSnapshot`, где внутри может быть `equipmentProfileSnapshot`;
- отдельная колонка `equipmentProfileSnapshot`;
- `waterPlanSnapshot`.

Это snapshot-данные партии. Они не означают, что текущий water setup рецепта рассчитывает объемы от оборудования.

## Практическая матрица влияния

| Действие пользователя | Верхний объем/эффективность/кипячение меняются? | Snapshot/provenance меняется? | Основные stats меняются? |
| --- | --- | --- | --- |
| Создать новый рецепт при наличии основного профиля | Да, стартово подставляются объем и эффективность | Да, сохраняется provenance профиля | Да, от подставленных recipe-level значений |
| Выбрать сохраненный профиль в `Параметры партии` | Да, подставляются объем и эффективность профиля | Да | Да, от новых recipe-level значений |
| Выбрать `Без профиля` | Нет, текущие поля рецепта сохраняются | Да, профиль сбрасывается | Нет, пока сами поля рецепта не изменены |
| Изменить верхний `Объём` | Да | Нет | Да: OG/FG/ABV/IBU/цвет и общий объем water setup |
| Изменить верхнюю `Эффективность` | Да | Нет | Да: OG/FG/ABV/IBU |
| Изменить верхнее `Кипячение` | Да | Нет | Да: IBU и boil-time metadata |
| Нажать `Разбить объем` в water setup | Нет | Нет | Меняется распределение солей/кислот между затором и промывкой |
| Изменить профиль на `/app/equipment` | Нет для существующих рецептов | Нет для существующих рецептов | Нет |
| Сделать профиль основным на `/app/equipment` | Только для следующих новых рецептов | Только для следующих новых рецептов | Только через стартовые значения нового рецепта |
| Удалить профиль, который был provenance рецепта | Нет | `equipmentProfileId` может стать `null`, сохраненный snapshot может остаться | Нет |

## Главный принцип

Профиль оборудования дает стартовые значения для нового рецепта и может явно подставить `Объём`/`Эффективность` при выборе в мастере. Рецепт хранит собственные `Объём`, `Эффективность` и `Кипячение`; именно они управляют расчетами и water setup. Правка рецепта не меняет профиль оборудования, а правка профиля не переписывает уже созданный рецепт.
