# Оборудование в мастере рецептов

Дата проверки: 2026-04-21.

Документ описывает текущее фактическое поведение оборудования в мастере рецептов и на странице `/app/equipment`: какие данные где хранятся, какие поля видны в UI, что влияет на расчеты рецепта, а что работает только как профиль/подсказка.

## Короткий вывод

В мастере рецептов сейчас есть два разных слоя данных:

1. Верхние поля рецепта в блоке `Параметры партии`:
   - `Объём`;
   - `Эффективность, %`;
   - `Кипячение, мин`.

   Это основные поля самого рецепта. Именно они напрямую используются для OG, FG, ABV, цвета и базового IBU.

2. Блок `Оборудование` ниже воды:
   - хранит ссылку на профиль оборудования и snapshot профиля;
   - считает derived volumes: pre-boil, post-boil, mash/sparge water;
   - может влиять на IBU через pre/post-boil volume, `hopUtilizationFactor` и `altitudeM`;
   - может влиять на расчет воды;
   - сам по себе не переписывает верхние поля `Объём / Эффективность / Кипячение`.

Профиль на `/app/equipment` начинает влиять на конкретный рецепт только после явного выбора профиля в блоке `Оборудование`. Флаг `Основной` на странице `/app/equipment` влияет на порядок/метку профилей, но сам по себе не привязывает профиль к новым или существующим рецептам. Изменение профиля на странице `/app/equipment` не обновляет уже сохраненный snapshot в рецепте автоматически: в мастере нужно нажать `Обновить из профиля`.

Важно: действие `Масштабировать рецепт` - отдельное. Только оно переносит параметры выбранного профиля в верхние поля рецепта и меняет ингредиенты.

## Состояние указанного рецепта

Для рецепта `ec92e2d9-6489-44aa-8ddc-38b510ba705f` на момент проверки в базе:

- `title`: `Новый рецепт 18`;
- верхний `Объём`: `20 l`;
- верхняя `Эффективность`: `75`;
- верхнее `Кипячение`: `60`;
- `equipmentProfileId`: `null`;
- `equipmentProfileSnapshot`: есть;
- snapshot name: `Starter 20L BIAB234234`;
- snapshot `targetBatchVolumeL = 20`;
- snapshot `boilTimeMin = 60`;
- snapshot `brewhouseEfficiencyPct = 68`;
- snapshot `brewMethod = biab_single_vessel`;
- snapshot `grainAbsorptionLPerKg = 0.7`;
- `waterPlanMeta` есть, water setup включен (`setupEnabled: true`), ручных water-volume override нет.

У пользователя при этом есть сохраненные профили:

- `Клон Braumeister` - основной, `targetBatchVolumeL = 27`, `brewhouseEfficiencyPct = 72`;
- `HERMS` - `targetBatchVolumeL = 20`, `brewhouseEfficiencyPct = 70`;
- `Bruzilla` - `targetBatchVolumeL = 20`, `brewhouseEfficiencyPct = 70`.

Ни один из этих сохраненных профилей сейчас не привязан к указанному рецепту: `equipmentProfileId = null`. При этом в рецепте остался snapshot от прежнего профиля. Поэтому:

- верхние OG/FG/ABV рецепта продолжают использовать recipe-level эффективность `75%`, а не snapshot/profile efficiency;
- water/equipment summary и equipment-sensitive часть IBU используют сохраненный snapshot `Starter 20L BIAB234234`;
- `Обновить из профиля` в мастере недоступно, потому что ссылка на live row профиля отсутствует;
- `Масштабировать рецепт` доступно, потому что snapshot есть;
- текущий основной профиль `Клон Braumeister` не применяется автоматически.

## Где это находится в коде

Основные файлы:

- `apps/web/components/recipes/recipe-designer.tsx` - UI мастера рецептов, состояние верхних полей, блок `Оборудование`, autosave/preview.
- `apps/web/features/recipes/service.ts` - сохранение рецепта и расчет stats.
- `apps/web/features/recipes/equipment-scaling.ts` - логика `Масштабировать рецепт`.
- `apps/web/features/recipes/water-plan.ts` - расчет воды через equipment snapshot или starter profile.
- `apps/web/features/equipment-profiles/contracts.ts` - schema полей профиля оборудования.
- `apps/web/features/equipment-profiles/volume-plan.ts` - расчет pre-boil/post-boil/воды.
- `apps/web/features/equipment/defaults.ts` - starter defaults и имя следующего нового профиля.
- `apps/web/features/equipment-profiles/service.ts` - CRUD профилей, основной профиль и создание snapshot.
- `apps/web/app/(app)/app/equipment/page.tsx` - страница `/app/equipment`.
- `apps/web/app/(app)/app/equipment/actions.ts` - server actions создания/редактирования/удаления/дублирования/выбора основного профиля.
- `apps/web/features/recipes/interop/beerxml.ts` - BeerXML export/import, включая `BOIL_SIZE`.
- `apps/web/features/brew-batches/brew-plan.ts` и `apps/web/features/brew-batches/service.ts` - snapshot оборудования при создании партии варки.
- `packages/db/src/schema.ts` - таблицы `equipment_profiles`, `recipes`, `brew_batches`.

## Модель данных

### `equipment_profiles`

Профили оборудования хранятся отдельно от рецептов. Поля:

| Поле | Что означает | Где используется |
| --- | --- | --- |
| `name` | Название профиля | UI, summary, snapshot |
| `brewMethod` | Legacy-тип системы | Хранится в модели/snapshot и не показывается в форме `/app/equipment` |
| `targetBatchVolumeL` | Целевой объем партии профиля | volume plan, summary, `Масштабировать рецепт` |
| `boilTimeMin` | Время кипячения профиля | volume plan, `Масштабировать рецепт` |
| `brewhouseEfficiencyPct` | Эффективность профиля | summary, `Масштабировать рецепт`; не прямой расчет OG, пока не перенесена в верхнее поле рецепта |
| `mashEfficiencyPct` | Эффективность затирания | Сохраняется в модели и snapshot, но убрана из формы профиля оборудования |
| `evaporationRateLPerHr` | Испарение в час | volume plan: pre-boil hot |
| `trubChillerLossL` | Потери в котле / на чиллере | volume plan: post-boil cold before kettle loss |
| `fermenterLossL` | Потери в ферментере | хранится в профиле и доступно в `Еще параметры` |
| `mashTunDeadspaceL` | Потери в заторнике | хранится в модели, но убрано из обычной формы |
| `spargeVesselDeadspaceL` | Потери при промывке | хранится в модели, но убрано из обычной формы |
| `grainAbsorptionLPerKg` | Поглощение воды зерном | total water |
| `coolingShrinkagePct` | Усадка при охлаждении | post-boil hot |
| `topUpWaterL` | Вода на долив | хранится в модели, но убрано из обычной формы |
| `mashThicknessLPerKg` | Гидромодуль | mash water для не-BIAB методов |
| `maxMashVolumeL` | Лимит заторника | warnings и перенос избытка в sparge для BIAB |
| `maxKettleVolumeL` | Лимит котла | warning `kettle_volume_limit_exceeded`; fallback max mash для BIAB |
| `hopUtilizationFactor` | Калибровка утилизации хмеля | прямой множитель IBU, если snapshot есть |
| `altitudeM` | Высота над уровнем моря | передается в расчет IBU, если snapshot есть |
| `isDefault` | Основной профиль пользователя | сортировка/метка на `/app/equipment`; не автопривязка к рецептам |
| `notes` | Заметки | только хранение/UI |

### `recipes`

В рецепте есть отдельные поля:

- `batchSizeEnteredQuantity`, `batchSizeEnteredUnit`;
- `batchSizeNormalizedQuantity`, `batchSizeNormalizedUnit`;
- `efficiency`;
- `boilTimeMinutes`;
- `equipmentProfileId`;
- `equipmentProfileSnapshot`;
- `waterPlanMeta`;
- `brewPlanMeta`.

`equipmentProfileId` - ссылка на live row профиля. `equipmentProfileSnapshot` - копия значений профиля на момент выбора/обновления. Расчеты рецепта используют именно snapshot, а не живой row профиля.

Эти два поля могут временно или постоянно разойтись. Например, если профиль удален, foreign key ставит `equipmentProfileId = null`, но `equipmentProfileSnapshot` в рецепте остается. В таком состоянии расчет продолжает использовать snapshot, но обновить его из `/app/equipment` уже нельзя, пока пользователь не выберет новый профиль.

## `/app/equipment`

Страница `/app/equipment` показывает:

1. Верхний intro-блок `Профили оборудования`.
2. Количество профилей и имя основного профиля, если он есть.
3. Кнопку `Создать профиль`.
4. Список карточек профилей.

Форма `Новый профиль` не открыта по умолчанию. Она появляется только на `/app/equipment?mode=create`. Редактирование открывается inline только для выбранной карточки через `/app/equipment?edit={profileId}`.

Карточка профиля показывает summary-first:

- название;
- badge `Основной`, если это основной профиль;
- `Типичный объем партии`;
- `Эффективность`;
- `Испарение`;
- actions `Редактировать`, `Дублировать`, `Сделать основным` для неосновного профиля, `Удалить`.

`listEquipmentProfiles` сортирует профили так, что основной идет первым, затем по `updatedAt desc`.

### Видимая форма

В форме создания/редактирования сейчас видны:

- `Название`;
- `Типичный объем партии, л`;
- `Эффективность, %`;
- `Испарение, л/ч`;
- `Потери в котле / на чиллере, л`;
- `Гидромодуль, л/кг`;
- `Поглощение воды зерном, л/кг`.

`Кипячение, мин` сейчас не показано как видимое поле формы. Значение сохраняется через hidden input из текущего значения профиля/starter defaults.

### Еще параметры

Один блок `Еще параметры (опционально)`, скрытый по умолчанию. Внутри:

- `Потери в ферментере, л`;
- `Усадка при охлаждении, %`;
- `Макс. объем заторника, л (опц.)`;
- `Макс. объем котла, л (опц)`;
- `Калибровка утилизации хмеля`;
- `Высота над уровнем моря, м`;
- `Заметки`.

Встроенного блока `Что будет рассчитано` на странице `/app/equipment` сейчас нет. Pre-boil/post-boil/mash/sparge summary показывается в мастере рецептов, когда открываешь блок `Оборудование`.

### Скрытые/убранные поля

Форма не показывает пользователю видимые controls для:

- `brewMethod`;
- `boilTimeMin`;
- `mashEfficiencyPct`;
- `mashTunDeadspaceL`;
- `spargeVesselDeadspaceL`;
- `topUpWaterL`.

Часть этих значений передается hidden inputs (`brewMethod`, `boilTimeMin`, `mashTunDeadspaceL`, `spargeVesselDeadspaceL`, `topUpWaterL`), чтобы сохранить текущие значения формы. `mashEfficiencyPct` hidden input не рендерится.

При сохранении обычной формы:

- `brewMethod` ставится автоматически в `mash_sparge_two_vessel`;
- `mashEfficiencyPct` для существующего профиля сохраняет текущее значение, для нового профиля становится `null`;
- `mashTunDeadspaceL`, `spargeVesselDeadspaceL`, `topUpWaterL` сохраняются из hidden values формы; в starter defaults это `0`.

Создание/сохранение/удаление/дублирование/выбор основного профиля обновляет `/app/equipment` и `/app/recipes/new`. Существующие рецепты с уже снятым snapshot автоматически не обновляются.

Первый созданный профиль автоматически получает `isDefault = true`. Если удалить основной профиль, сервис выбирает замену из оставшихся профилей по последнему `updatedAt`. Миграция `0027_equipment_profile_default.sql` также выставляет один основной профиль на пользователя для уже существующих данных.

## Профиль по умолчанию

`Профиль по умолчанию` в мастере рецептов - это встроенный starter profile, а не основной сохраненный профиль из `/app/equipment`.

Когда у рецепта `equipmentProfileSnapshot = null`, код строит временный starter snapshot:

- `name = Профиль оборудования (1)`;
- `brewMethod = mash_sparge_two_vessel`;
- `targetBatchVolumeL = текущий верхний объем рецепта`, если он валиден, иначе `20`;
- `boilTimeMin = 60`;
- `brewhouseEfficiencyPct = 70`;
- `evaporationRateLPerHr = 3`;
- `trubChillerLossL = 1`;
- `fermenterLossL = 0`;
- `mashTunDeadspaceL = 0`;
- `spargeVesselDeadspaceL = 0`;
- `grainAbsorptionLPerKg = 0.8`;
- `mashThicknessLPerKg = 3.0`;
- `topUpWaterL = 0`;
- `coolingShrinkagePct = 4`;
- `maxMashVolumeL = null`;
- `maxKettleVolumeL = null`;
- `hopUtilizationFactor = 1`;
- `altitudeM = 0`.

Этот starter profile используется для water/equipment volume summary. Для основных stats рецепта он не подменяет верхнюю эффективность и верхнее кипячение.

Флаг `Основной` у сохраненного профиля не меняет это поведение. Если в мастере выбран пункт `Использовать профиль по умолчанию`, рецепт сбрасывается на starter profile (`equipmentProfileId = null`, `equipmentProfileSnapshot = null`), а не на сохраненный основной профиль пользователя.

## Блок `Параметры партии` в мастере

Наверху рецепта пользователь видит:

- расчетные карточки: цвет, OG/НП, FG/КП, IBU, ABV, стиль;
- поля `Объём`, `Эффективность, %`, `Кипячение, мин`.

Эти поля входят в payload рецепта и autosave:

- `Объём` -> `batchSizeEnteredQuantity` + `batchSizeEnteredUnit`;
- `Эффективность` -> `efficiency`;
- `Кипячение` -> `boilTimeMinutes`.

Live preview пересчитывается через 400 мс после изменения payload. Autosave идет отдельно.

Если `efficiency` пустая/null, сервис расчета использует fallback `75`.

## Блок `Оборудование` в мастере

Блок находится ниже блока воды и свернут по умолчанию.

В summary:

- если snapshot есть: `{name} • {targetBatchVolumeL} л в ферментер • {brewhouseEfficiencyPct}% • испарение {evaporationRateLPerHr} л/ч`;
- если snapshot нет: `Профиль по умолчанию`.

Summary смотрит на наличие snapshot, а не только на `equipmentProfileId`. Поэтому возможен случай `equipmentProfileId = null`, но summary показывает старый snapshot профиля.

Внутри блока:

- select `Выбрать профиль`;
- кнопка `Обновить из профиля`;
- кнопка `Использовать профиль по умолчанию`;
- ссылка `Изменить` на `/app/equipment`;
- кнопка `Масштабировать рецепт`;
- summary метода, целевого объема, pre-boil hot, post-boil hot, mash/sparge, калибровки хмеля;
- warning, если используется starter profile;
- warning, если pre-boil превышает лимит котла.

Кнопка `Обновить из профиля` активна только когда есть `equipmentProfileId`. Кнопка `Масштабировать рецепт` активна когда есть `equipmentProfileSnapshot`.

### `Выбрать профиль`

При выборе профиля мастер вызывает server action `getEquipmentProfileSnapshotAction(profileId)`.

Результат:

- `equipmentProfileId` становится id выбранного профиля;
- `equipmentProfileSnapshot` получает копию всех полей профиля;
- payload становится dirty и уходит в preview/autosave.

Выбор профиля не меняет верхние поля:

- верхний `Объём` остается прежним;
- верхняя `Эффективность` остается прежней;
- верхнее `Кипячение` остается прежним.

Но после выбора профиля сразу меняются:

- equipment summary;
- water volume plan;
- IBU, если в рецепте есть хмель и OG, потому что расчет получает pre/post-boil volumes, `hopUtilizationFactor`, `altitudeM`.

Если выбрать пустой пункт `Использовать профиль по умолчанию` в select, мастер сразу ставит `equipmentProfileId = null` и `equipmentProfileSnapshot = null`.

### `Обновить из профиля`

Кнопка снова читает текущий row профиля из `/app/equipment` и заменяет только `equipmentProfileSnapshot`.

Она не переносит `targetBatchVolumeL`, `brewhouseEfficiencyPct`, `boilTimeMin` в верхние поля рецепта.

Если у рецепта остался snapshot, но `equipmentProfileId = null`, кнопка disabled: live row неоткуда читать.

### `Использовать профиль по умолчанию`

Кнопка сбрасывает:

- `equipmentProfileId = null`;
- `equipmentProfileSnapshot = null`.

После этого water/equipment summary строится по starter profile. Живые профили на `/app/equipment`, включая основной профиль, не используются.

### `Изменить`

Это обычная ссылка на `/app/equipment`.

Изменение профиля там не меняет уже открытый/сохраненный рецепт само по себе. Нужно вернуться в мастер и нажать `Обновить из профиля`.

### `Масштабировать рецепт`

Кнопка активна только когда есть equipment snapshot.

Она делает отдельное практическое масштабирование:

- верхний `Объём` ставится в `equipmentProfileSnapshot.targetBatchVolumeL`;
- верхняя `Эффективность` ставится в `equipmentProfileSnapshot.brewhouseEfficiencyPct`;
- верхнее `Кипячение` ставится в `equipmentProfileSnapshot.boilTimeMin`;
- fermentables масштабируются по формуле:
  `targetBatchVolumeL / currentBatchVolumeL * currentEfficiencyPct / targetEfficiencyPct`;
- hops масштабируются по `targetBatchVolumeL / currentBatchVolumeL`;
- остальные категории ингредиентов не масштабируются.

То есть профиль влияет на основные OG/FG/ABV/цвет через верхние поля и ингредиенты только после нажатия `Масштабировать рецепт`.

## Расчеты: что от чего зависит

### OG / НП

OG считается из:

- fermentables;
- верхнего batch volume рецепта;
- верхней `efficiency` рецепта или fallback `75`.

Equipment snapshot напрямую OG не меняет.

Исключение практическое: если нажать `Масштабировать рецепт`, верхняя эффективность и количества fermentables изменятся, и OG пересчитается уже по новым данным.

### FG / КП

FG считается из:

- OG;
- yeast attenuation;
- mash profile;
- manual attenuation override или manual FG override из `calculationMeta`.

Equipment snapshot напрямую FG не меняет. Он может повлиять только косвенно, если через масштабирование поменялись OG/ингредиенты/верхние поля.

### ABV

ABV считается из OG и FG. Equipment snapshot напрямую ABV не меняет.

### Цвет

Цвет считается из fermentables и верхнего batch volume рецепта. Equipment snapshot напрямую цвет не меняет.

### IBU

IBU считается из:

- OG;
- верхнего batch volume рецепта;
- верхнего `boilTimeMinutes`;
- hop additions;
- `calculationMeta.bitternessFormula`;
- `calculationMeta.bitternessSettings`.

Если `equipmentProfileSnapshot` есть, дополнительно в расчет IBU передаются:

- `preBoilVolumeL` из volume plan;
- `postBoilVolumeL` из volume plan;
- `fermentableGravityPoints`, рассчитанные через post-boil volume;
- `hopUtilizationFactor`;
- `altitudeM`.

Если snapshot отсутствует:

- `preBoilVolumeL = null`;
- `postBoilVolumeL = batchVolumeL`;
- `hopUtilizationFactor = 1`;
- `altitudeM = 0`.

### Вода

Water plan всегда строит volume plan:

- если есть `equipmentProfileSnapshot`, используется он;
- если snapshot нет, используется starter profile с target volume из верхнего объема рецепта.

Потом water plan может быть переопределен вручную:

- `mashWaterVolumeL`;
- `spargeWaterVolumeL`;
- `totalWaterVolumeL`.

Если хотя бы одно из этих полей задано, источник water volumes становится `manual_override`. Иначе source:

- `equipment_profile`, если snapshot есть;
- `starter_profile`, если snapshot отсутствует.

Поля equipment profile, влияющие на water/volume plan:

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

### BeerXML export/import

Export:

- `BATCH_SIZE` берется из верхнего объема рецепта;
- `BOIL_TIME` берется из верхнего `boilTimeMinutes`;
- `EFFICIENCY` берется из верхней эффективности рецепта;
- `TYPE` становится `Extract`, если `equipmentProfileSnapshot.brewMethod = extract_partial_boil`; иначе `All Grain`;
- `BOIL_SIZE` считается как `preBoilHotL`, но только если у рецепта есть equipment snapshot.

Import:

- BeerXML/Brewfather импортируют batch size, boil time, efficiency в верхние поля рецепта;
- equipment profile snapshot из импортируемого файла сейчас не создается.

### Start brew / партии

При `Начать варку` создается `brew_batches`.

В batch сохраняются:

- `brewPlanSnapshot`, где внутри есть `equipmentProfileSnapshot`;
- отдельная колонка `equipmentProfileSnapshot`;
- `waterPlanSnapshot`.

Если в рецепте нет equipment snapshot, в batch тоже попадет `null`.

## Практическая матрица влияния

| Действие пользователя | Верхний объем/эффективность/кипячение меняются? | Snapshot меняется? | Основные stats меняются? |
| --- | --- | --- | --- |
| Изменить верхний `Объём` | Да | Нет | Да: OG/FG/ABV/IBU/цвет |
| Изменить верхнюю `Эффективность` | Да | Нет | Да: OG/FG/ABV/IBU |
| Изменить верхнее `Кипячение` | Да | Нет | Да: IBU и boil-time metadata |
| Выбрать профиль в `Оборудование` | Нет | Да | Может измениться IBU; меняются water/equipment volumes |
| Нажать `Обновить из профиля` | Нет | Да | Может измениться IBU; меняются water/equipment volumes |
| Нажать `Использовать профиль по умолчанию` | Нет | Да, сброс в `null` | Может измениться IBU; water/equipment volumes переходят на starter |
| Изменить профиль на `/app/equipment` | Нет | Нет для существующих рецептов | Нет, пока не обновить snapshot в мастере |
| Сделать профиль основным на `/app/equipment` | Нет | Нет | Нет |
| Удалить профиль, который был привязан к рецепту | Нет | `equipmentProfileId` станет `null`, snapshot останется | Обычно нет: расчеты продолжат использовать старый snapshot |
| Нажать `Масштабировать рецепт` | Да | Нет | Да: меняются верхние поля и часть ингредиентов |

## Ответ на главный вопрос

Поля `Объём`, `Эффективность` и `Кипячение` наверху рецепта - это самостоятельные recipe-level поля и главный источник базовых расчетов.

Блок `Оборудование` связан с ними не автоматически, а через явные действия:

- выбор профиля сохраняет snapshot и влияет на water/equipment volumes и часть IBU;
- обновление профиля обновляет snapshot;
- профиль по умолчанию в мастере используется только как временный starter profile для volume/water summary, когда snapshot отсутствует;
- основной профиль на `/app/equipment` не применяется автоматически;
- масштабирование рецепта переносит volume/efficiency/boil time из snapshot в верхние поля и масштабирует ингредиенты.

Поэтому в текущем указанном рецепте сохраненные профили на `/app/equipment` не влияют автоматически, потому что live profile link отсутствует. Но старый `equipmentProfileSnapshot` в рецепте есть, и он продолжает влиять на water/equipment summary и на equipment-sensitive часть IBU. Основные OG/FG/ABV/цвет работают от верхних полей рецепта: `20 л`, `75%`, `60 мин`.
