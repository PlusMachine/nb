# Профили оборудования — Reference

> **Назначение:** профили оборудования: поля, defaults, роль в расчётах объёмов; что НЕ влияет на OG/FG/IBU.
> **Источники истины (код):** `apps/web/features/equipment-profiles/*`, `packages/db/src/schema.ts` (equipmentProfiles), `apps/web/features/recipes/water-plan.ts`
> **Обновлено:** 2026-06-25
> **См. также:** [CONTEXT.md](../../CONTEXT.md), [recipes-editor.md](recipes-editor.md), [water.md](water.md)

---

## Роль профиля

Профиль оборудования хранится отдельно от рецептов (таблица `equipment_profiles`, привязка к `userId`). Профиль не задаёт промывку и не задаёт split воды — разделение на `заторная` / `промывочная` живёт в water setup рецепта.

### Стартовые значения нового рецепта

В мастере рецептов нет отдельного блока «Оборудование»; есть select `Оборудование` в блоке `Параметры партии`.

- При создании нового рецепта по умолчанию выбирается **основной** профиль (`isDefault = true`); если основного нет — первый из списка; если профилей нет — fallback `20 л` / `75 %`, а select показывает `Без профиля`.
- Из выбранного профиля копируются в recipe-level поля:
  - `targetBatchVolumeL` → верхний `Объём` (`batchSizeEnteredQuantity` + `batchSizeEnteredUnit`);
  - `brewhouseEfficiencyPct` → верхняя `Эффективность, %` (`efficiency`).
- При ручном выборе другого сохранённого профиля в мастере объём и эффективность подставляются заново. Пункт `Без профиля — ручной ввод параметров` убирает привязку, но текущие поля рецепта не сбрасывает.

После подстановки **источник истины — поля самого рецепта**. Правка `Объём` / `Эффективность` / `Кипячение` в мастере меняет только рецепт; профиль на `/app/equipment` не мутирует. Правка профиля не переписывает уже созданные рецепты.

### Snapshot / provenance

В `recipes` сохраняются:

- `equipmentProfileId` (FK на `equipment_profiles`, `onDelete: set null`);
- `equipmentProfileSnapshot` (jsonb) — provenance: от какого профиля взяты стартовые параметры.

При выборе сохранённого профиля в мастере обновляются `equipmentProfileId`, `equipmentProfileSnapshot`, верхний `Объём` и верхняя `Эффективность`. Отдельной кнопки «обновить snapshot» и масштабирования рецепта под профиль нет. Расчёты рецепта **не читают** snapshot как источник volume plan или IBU-модификаторов. Форма snapshot — `equipmentProfileSnapshotSchema` = payload-схема + `id` + `snapshotAt`; лишние старые ключи из legacy-рецептов новой схемой не принимаются.

При `Начать варку` создаётся `brew_batches` со snapshot-данными партии: `brewPlanSnapshot` (внутри может быть `equipmentProfileSnapshot`), отдельная колонка `equipmentProfileSnapshot`, `waterPlanSnapshot`. Это снимки на момент варки, а не признак того, что water setup считает объёмы от оборудования.

### Управление профилями (`/app/equipment`)

`listEquipmentProfiles` сортирует: основной первым, затем по `updatedAt desc`. Первый созданный профиль автоматически становится основным (`isDefault` ставится, если профилей ещё нет). При удалении основного сервис назначает заменой профиль с последним `updatedAt`. Уникальные индексы: `(userId, name)` и частичный `(userId) WHERE isDefault = true`. Actions на странице: `Создать`, `Редактировать`, `Дублировать` (имя `… (копия)` / `… (копия N)`), `Сделать основным`, `Удалить`.

## Поля

Схема профиля содержит только поля, реально присутствующие в форме `/app/equipment` (видимый компонент `equipment-profile-form-basic.tsx`). Форма = основной набор + раскрываемый блок `Еще параметры (опционально)`.

Колонка **Default (форма/starter)** — значения нового профиля (`starterEquipmentProfileDefaults` + `equipmentProfileSaneDefaults`). Колонка **Default (schema/DB)** — fallback Zod-схемы `equipmentProfilePayloadSchema` и DEFAULT столбца в `equipment_profiles`. Эти два набора отличаются по `brewhouseEfficiencyPct`, `trubChillerLossL`, `grainAbsorptionLPerKg`.

### Основные поля

| Поле | БД (колонка) | UI | Default (форма/starter) | Default (schema/DB) | Роль |
| --- | --- | --- | ---: | ---: | --- |
| `name` | `name` | Название | `Профиль оборудования (1)` | — (required) | UI, snapshot/provenance |
| `targetBatchVolumeL` | `target_batch_volume_l` | Типичный объём партии, л | 20 | — (required, > 0) | Стартовый `Объём` рецепта; база volume plan; summary |
| `brewhouseEfficiencyPct` | `brewhouse_efficiency_pct` | Эффективность, % | 70 | 75 | Стартовая `Эффективность` рецепта; summary |
| `evaporationRateLPerHr` | `evaporation_rate_l_per_hr` | Испарение, л/ч | 3 | 3 | Boil-off в volume plan; summary |
| `trubChillerLossL` | `trub_chiller_loss_l` | Потери в котле / на чиллере, л | 1 | 0 | Volume plan; summary |
| `mashThicknessLPerKg` | `mash_thickness_l_per_kg` | Гидромодуль, л/кг | 3.0 | 3 (> 0) | Расчёт mash/sparge split в volume plan |
| `grainAbsorptionLPerKg` | `grain_absorption_l_per_kg` | Поглощение воды зерном, л/кг | 0.80 | 0.75 | Поглощение зерном в volume plan; summary |

### Еще параметры (опционально)

| Поле | БД (колонка) | UI | Default (форма/starter) | Default (schema/DB) | Роль |
| --- | --- | --- | ---: | ---: | --- |
| `fermenterLossL` | `fermenter_loss_l` | Потери в ферментере, л | 0 | 0 | Хранение/UI (в текущем volume plan не используется) |
| `coolingShrinkagePct` | `cooling_shrinkage_pct` | Усадка при охлаждении, % | 4 | 4 (0..20) | Усадка hot→cold в volume plan; summary |
| `maxMashVolumeL` | `max_mash_volume_l` | Макс. объём заторника, л | `null` | `null` | Лимит/warning заторника |
| `maxKettleVolumeL` | `max_kettle_volume_l` | Макс. объём котла, л | `null` | `null` | Лимит/warning котла |
| `hopUtilizationFactor` | `hop_utilization_factor` | Калибровка утилизации хмеля | 1 | 1 (> 0) | Хранение/UI; **больше не драйвит IBU** |
| `altitudeM` | `altitude_m` | Высота над уровнем моря, м | 0 | 0 (−500..9000) | Хранение/UI; **больше не драйвит IBU** |
| `notes` | `notes` | Заметки | `null` | `null` | Только хранение/UI |

Дополнительно в таблице/DTO: `isDefault` (`is_default`, default `false`) — признак основного профиля; `id`, `userId`, `createdAt`, `updatedAt`.

## Удалённые поля

Поля убраны из `equipmentProfilePayloadSchema`, `equipmentProfileSnapshotSchema` и из таблицы `equipment_profiles` миграцией `packages/db/drizzle/0028_equipment_profile_visible_fields.sql`. Они не должны попадать в payload создания/обновления и в новый snapshot.

| Поле | Причина |
| --- | --- |
| `brewMethod` | Не было явного управления в мастере оборудования |
| `boilTimeMin` | Кипячение — поле рецепта `boilTimeMinutes` |
| `mashEfficiencyPct` | Не было явного управления в мастере оборудования |
| `mashTunDeadspaceL` | Не было явного управления в мастере оборудования |
| `spargeVesselDeadspaceL` | Не было явного управления в мастере оборудования |
| `topUpWaterL` | Не было явного управления в мастере оборудования |

## Volume plan

`calculateEquipmentVolumePlan(profile, grainKg, boilTimeMinutes = 60)` (`features/equipment-profiles/volume-plan.ts`) считает объёмы «назад» от целевого объёма в ферментере. `boilTimeHr = boilTimeMinutes / 60` (или 1, если значение невалидно/≤ 0).

```
fermenterTargetColdL           = targetBatchVolumeL
postBoilColdBeforeKettleLossL  = fermenterTargetColdL + trubChillerLossL
postBoilHotL                   = postBoilColdBeforeKettleLossL / (1 - coolingShrinkagePct / 100)   // усадка hot→cold
preBoilHotL                    = postBoilHotL + evaporationRateLPerHr * boilTimeHr                 // boil-off
grainAbsorptionLossL           = grainKg * grainAbsorptionLPerKg                                   // поглощение зерном
totalWaterL                    = max(0, preBoilHotL + grainAbsorptionLossL)

desiredMashWaterL              = grainKg * mashThicknessLPerKg
maxMashWaterL                  = maxMashVolumeL ?? desiredMashWaterL
mashWaterL                     = min(totalWaterL, min(desiredMashWaterL, maxMashWaterL))
spargeWaterL                   = max(0, totalWaterL - mashWaterL)
```

Warnings: `kettle_volume_limit_exceeded` если `preBoilHotL > maxKettleVolumeL`; `mash_volume_limit_exceeded` если `desiredMashWaterL > maxMashWaterL`.

### Приоритет объёмов в water setup рецепта

`buildRecipeWaterPlanResult` (`features/recipes/water-plan.ts`) выбирает общий объём минерализации (`automaticTotalWaterL`) по убыванию приоритета:

1. `waterPlanMeta.totalWaterVolumeL` — ручной/legacy override (`manual_total`);
2. `equipmentVolumePlan.totalWaterL` — план, переданный из выбранного профиля (`equipment_profile`);
3. **estimated** — синтетический план от `fallbackEquipmentProfileSnapshot(recipeBatchVolumeL, …)` (starter-defaults + объём рецепта), считается когда профиль не передан, но есть `recipeBatchVolumeL > 0` (`estimated_total_water`);
4. `recipeBatchVolumeL` — объём рецепта в литрах как последний fallback (`batch_size`);
5. иначе `0`.

> Уточнение по коду: даже **без** equipment-профиля fallback теперь не «голый» batch size, а estimated volume plan от дефолтных параметров оборудования; чистый `batch_size` остаётся лишь крайним случаем. Поле `waterVolumes.source` маркирует, какой источник сработал.

Split mash/sparge:

- если split не включён, весь рассчитанный total считается одним объёмом, `spargeWaterL = 0`;
- кнопка `Разделить на затор и промывку` берёт suggested split из volume plan; без него fallback 65/35;
- при ручном split `totalWaterL = mashWaterL + spargeWaterL`. Сумма split может быть больше размера партии — это нормально (часть воды теряется на absorption, кипячение, trub/chiller loss, усадку);
- warning `water_split_below_batch_volume` появляется только если ручной split + 0.05 < `recipeBatchVolumeL`.

Соли считаются на общий объём; при split добавки делятся между затором и промывкой пропорционально объёмам. Кислота в промывку считается только если включена acidification промывки и `spargeWaterL > 0`.

### Расчётный summary профиля (диагностика)

`buildEquipmentProfileVolumeSummary` (`features/equipment/summary.ts`) прогоняет тот же `calculateEquipmentVolumePlan` через snapshot профиля (по умолчанию `grainKg = 5`) — это диагностика самого профиля (карточки на `/app/equipment`), а не water setup рецепта. Ключевые величины — те же, что в формуле выше (`fermenterTargetColdL`, `postBoilColdBeforeKettleLossL`, `postBoilHotL`, `preBoilHotL`, `grainAbsorptionLossL`, `mashWaterL`, `spargeWaterL`).

## Что профиль НЕ делает

После создания рецепта профиль **не драйвит** основные stats — их считают recipe-level поля:

- **OG / НП** — из fermentables, верхнего batch volume рецепта, верхней `efficiency` (fallback 75). Профиль напрямую не меняет.
- **FG / КП** — из OG, attenuation дрожжей, mash profile, manual overrides из `calculationMeta`. Профиль не меняет.
- **ABV** — из OG и FG. Профиль не меняет.
- **Цвет** — из fermentables и верхнего batch volume. Профиль не меняет.
- **IBU** — из OG, верхнего batch volume, верхнего `boilTimeMinutes`, hop additions, `calculationMeta.bitternessFormula` / `bitternessSettings`. Equipment snapshot больше не передаёт в IBU `preBoilVolumeL`, `postBoilVolumeL`, `hopUtilizationFactor`, `altitudeM`. Сейчас фиксировано: `preBoilVolumeL = null`, `postBoilVolumeL = batchVolumeL`, `hopUtilizationFactor = 1`, `altitudeM = 0`.

**Water setup ≠ equipment volume plan.** Water setup — это пошаговая настройка минерализации воды и pH; общий объём отделён от размера партии и берётся по приоритету из раздела «Приоритет объёмов» выше. Профиль участвует в volume plan только как набор параметров (absorption / boil-off / shrinkage / гидромодуль / лимиты); поля `evaporationRateLPerHr`, `trubChillerLossL`, `grainAbsorptionLPerKg`, `coolingShrinkagePct`, `mashThicknessLPerKg`, `maxMashVolumeL`, `maxKettleVolumeL` влияют только на volume plan / summary, но не на OG/FG/IBU.

BeerXML: export берёт `BATCH_SIZE` / `BOIL_TIME` / `EFFICIENCY` из верхних полей рецепта, `TYPE = All Grain`, `BOIL_SIZE` из equipment volume plan не экспортируется. Import (BeerXML/Brewfather) кладёт batch size / boil time / efficiency в верхние поля рецепта; equipment profile snapshot из файла не создаётся.

## Практическая матрица

| Действие | Верхние `Объём`/`Эффективность`/`Кипячение` | Snapshot / provenance | Основные stats (OG/FG/ABV/IBU/цвет) |
| --- | --- | --- | --- |
| Создать новый рецепт при наличии основного профиля | Да: подставляются объём и эффективность профиля | Да: сохраняется provenance | Да: от подставленных recipe-level значений |
| Выбрать сохранённый профиль в `Параметры партии` | Да: объём и эффективность профиля | Да | Да: от новых recipe-level значений |
| Выбрать `Без профиля` | Нет: текущие поля рецепта сохраняются | Да: профиль сбрасывается | Нет (пока поля рецепта не изменены) |
| Изменить верхний `Объём` | Да (recipe-level) | Нет | Да: OG/FG/ABV/IBU/цвет + общий объём water setup |
| Изменить верхнюю `Эффективность` | Да (recipe-level) | Нет | Да: OG/FG/ABV/IBU |
| Изменить верхнее `Кипячение` | Да (recipe-level) | Нет | Да: IBU и boil-time metadata |
| Нажать `Разделить на затор и промывку` в water setup | Нет | Нет | Меняется только распределение солей/кислот между затором и промывкой |
| Изменить профиль на `/app/equipment` | Нет (для существующих рецептов) | Нет (для существующих рецептов) | Нет |
| Сделать профиль основным на `/app/equipment` | Только для будущих новых рецептов | Только для будущих новых рецептов | Только через стартовые значения нового рецепта |
| Удалить профиль-provenance рецепта | Нет | `equipmentProfileId` → `null`, сохранённый snapshot может остаться | Нет |

**Главный принцип:** профиль даёт стартовые значения нового рецепта и подставляет `Объём`/`Эффективность` при выборе в мастере; собственные `Объём`, `Эффективность`, `Кипячение` рецепта управляют расчётами и water setup. Правка рецепта не меняет профиль, правка профиля не переписывает уже созданный рецепт.
</content>
</invoke>
