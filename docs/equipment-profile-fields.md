# Поля профиля оборудования

Документ описывает пользовательское поведение формы `/app/equipment` и актуальный набор полей app-схемы профиля оборудования.

Профиль оборудования не задает промывку и не задает split воды. Разделение воды на `заторная` / `промывочная` находится в water setup рецепта.

## Структура формы

Форма состоит из основного набора полей и одного раскрываемого блока `Еще параметры (опционально)`.

## Основные поля

| Поле | БД | UI |
| --- | --- | --- |
| `name` | `name` | Название |
| `targetBatchVolumeL` | `target_batch_volume_l` | Типичный объем партии, л |
| `brewhouseEfficiencyPct` | `brewhouse_efficiency_pct` | Эффективность, % |
| `evaporationRateLPerHr` | `evaporation_rate_l_per_hr` | Испарение, л/ч |
| `trubChillerLossL` | `trub_chiller_loss_l` | Потери в котле / на чиллере, л |
| `mashThicknessLPerKg` | `mash_thickness_l_per_kg` | Гидромодуль, л/кг |
| `grainAbsorptionLPerKg` | `grain_absorption_l_per_kg` | Поглощение воды зерном, л/кг |

`targetBatchVolumeL` трактуется как типичный объем партии. В новом рецепте основной профиль выбирается по умолчанию и подставляет это значение в recipe-level `Объём`; при ручном выборе другого профиля в мастере рецепта значение подставляется снова.

## Еще параметры

| Поле | БД | UI |
| --- | --- | --- |
| `fermenterLossL` | `fermenter_loss_l` | Потери в ферментере, л |
| `coolingShrinkagePct` | `cooling_shrinkage_pct` | Усадка при охлаждении, % |
| `maxMashVolumeL` | `max_mash_volume_l` | Макс. объем заторника, л |
| `maxKettleVolumeL` | `max_kettle_volume_l` | Макс. объем котла, л |
| `hopUtilizationFactor` | `hop_utilization_factor` | Калибровка утилизации хмеля |
| `altitudeM` | `altitude_m` | Высота над уровнем моря, м |
| `notes` | `notes` | Заметки |

## Удалено из схем профиля

Эти поля больше не присутствуют в `equipmentProfilePayloadSchema`, `equipmentProfileSnapshotSchema` и `equipment_profiles`:

| Поле | Причина |
| --- | --- |
| `brewMethod` | Не было явного управления в мастере оборудования |
| `boilTimeMin` | Кипячение является полем рецепта `boilTimeMinutes` |
| `mashEfficiencyPct` | Не было явного управления в мастере оборудования |
| `mashTunDeadspaceL` | Не было явного управления в мастере оборудования |
| `spargeVesselDeadspaceL` | Не было явного управления в мастере оборудования |
| `topUpWaterL` | Не было явного управления в мастере оборудования |

Миграция: `packages/db/drizzle/0028_equipment_profile_visible_fields.sql`.

## Defaults

| Поле | Default |
| --- | ---: |
| `targetBatchVolumeL` | 20 |
| `brewhouseEfficiencyPct` | 70 |
| `evaporationRateLPerHr` | 3 |
| `trubChillerLossL` | 1 |
| `fermenterLossL` | 0 |
| `grainAbsorptionLPerKg` | 0.80 |
| `coolingShrinkagePct` | 4 |
| `mashThicknessLPerKg` | 3.0 |
| `maxMashVolumeL` | `null` |
| `maxKettleVolumeL` | `null` |
| `hopUtilizationFactor` | 1 |
| `altitudeM` | 0 |
| `notes` | `null` |

## Расчетный summary профиля

Equipment summary может оценить ориентировочные equipment-level объемы профиля. Это диагностика самого профиля, а не water setup рецепта.

| Расчетное значение | Формула / логика |
| --- | --- |
| `fermenterTargetColdL` | `targetBatchVolumeL` |
| `postBoilColdBeforeKettleLossL` | `fermenterTargetColdL + trubChillerLossL` |
| `postBoilHotL` | `postBoilColdBeforeKettleLossL / (1 - coolingShrinkagePct / 100)` |
| `preBoilHotL` | `postBoilHotL + evaporationRateLPerHr` |
| `grainAbsorptionLossL` | `grainKg * grainAbsorptionLPerKg` |
| `mashWaterL` | `grainKg * mashThicknessLPerKg` |
| `spargeWaterL` | `max(0, totalWaterL - mashWaterL)` |

Water setup рецепта использует `Объём` рецепта как общий объем минерализации и не берет эти equipment summary volumes.
