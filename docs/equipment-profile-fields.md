# Поля профиля оборудования

Документ описывает пользовательское поведение формы `/app/equipment`. Таблица `equipment_profiles` и snapshot рецепта по-прежнему могут хранить больше полей, но обычная форма показывает только практичные параметры оборудования.

Профиль оборудования не задает промывку и не задает split воды. Разделение воды на `в затор` / `в промывку` остается на уровне рецепта и water plan.

## Структура формы

Форма состоит из четырех простых частей:

1. `Основное`
2. `Вода`
3. `Что будет рассчитано`
4. `Дополнительно`

В `Дополнительно` используется один раскрываемый блок без вложенных секций.

## Основное

| Поле | БД | UI |
| --- | --- | --- |
| `name` | `name` | Название |
| `targetBatchVolumeL` | `target_batch_volume_l` | Объем партии, л |
| `boilTimeMin` | `boil_time_min` | Кипячение, мин |
| `brewhouseEfficiencyPct` | `brewhouse_efficiency_pct` | Эффективность, % |
| `evaporationRateLPerHr` | `evaporation_rate_l_per_hr` | Испарение, л/ч |
| `trubChillerLossL` | `trub_chiller_loss_l` | Потери в котле / на чиллере, л |

`targetBatchVolumeL` трактуется как объем в ферментере.

## Вода

Блок вторичный. Пользователь может оставить defaults.

| Поле | БД | UI |
| --- | --- | --- |
| `grainAbsorptionLPerKg` | `grain_absorption_l_per_kg` | Поглощение воды зерном, л/кг |
| `mashThicknessLPerKg` | `mash_thickness_l_per_kg` | Гидромодуль, л/кг |

`topUpWaterL` не выводится в обычную форму.

## Что будет рассчитано

Summary показывает только equipment-level объемы:

| UI | Расчетное поле |
| --- | --- |
| Pre-boil | `preBoilHotL` |
| Post-boil | `postBoilHotL` |
| Всего воды | `totalWaterL` |

`mashWaterL` и `spargeWaterL` не показываются в форме профиля оборудования, потому что split воды относится к рецепту.

Warnings короткие:

| Код | UI |
| --- | --- |
| `mash_volume_limit_exceeded` | Лимит затора |
| `kettle_volume_limit_exceeded` | Лимит котла |

## Дополнительно

Один раскрываемый блок без вложенных секций.

| Поле | БД | UI |
| --- | --- | --- |
| `fermenterLossL` | `fermenter_loss_l` | Потери в ферментере, л |
| `coolingShrinkagePct` | `cooling_shrinkage_pct` | Усадка при охлаждении, % |
| `maxMashVolumeL` | `max_mash_volume_l` | Лимит объема затора, л |
| `maxKettleVolumeL` | `max_kettle_volume_l` | Лимит объема котла, л |
| `hopUtilizationFactor` | `hop_utilization_factor` | Калибровка утилизации хмеля |
| `altitudeM` | `altitude_m` | Высота над уровнем моря, м |
| `notes` | `notes` | Заметки |

## Убрано из формы

Эти поля остаются в модели и snapshot, но не выводятся в обычную пользовательскую форму:

| Поле | Поведение при сохранении формы |
| --- | --- |
| `brewMethod` | Ставится автоматически как legacy-значение по умолчанию |
| `batchTargetType` | Убрано из app-схем и формы; объем профиля всегда считается объемом в ферментере |
| `mashEfficiencyPct` | Для существующих профилей сохраняется текущее значение |
| `mashTunDeadspaceL` | Сбрасывается в `0` при сохранении обычной формы |
| `spargeVesselDeadspaceL` | Сбрасывается в `0` при сохранении обычной формы |
| `topUpWaterL` | Сбрасывается в `0` при сохранении обычной формы |

## Defaults

| Поле | Default |
| --- | ---: |
| `targetBatchVolumeL` | 20 |
| `boilTimeMin` | 60 |
| `brewhouseEfficiencyPct` | 70 |
| `evaporationRateLPerHr` | 3 |
| `trubChillerLossL` | 1 |
| `grainAbsorptionLPerKg` | 0.80 |
| `mashThicknessLPerKg` | 3.0 |
| `fermenterLossL` | 0 |
| `coolingShrinkagePct` | 4 |
| `maxMashVolumeL` | `null` |
| `maxKettleVolumeL` | `null` |
| `hopUtilizationFactor` | 1 |
| `altitudeM` | 0 |

## Расчет объемов

Расчетная модель остается прежней для сохраненных данных:

| Расчетное значение | Формула / логика |
| --- | --- |
| `fermenterTargetColdL` | `targetBatchVolumeL` |
| `postBoilColdBeforeKettleLossL` | `fermenterTargetColdL + trubChillerLossL` |
| `postBoilHotL` | `postBoilColdBeforeKettleLossL / (1 - coolingShrinkagePct / 100)` |
| `preBoilHotL` | `postBoilHotL + evaporationRateLPerHr * (boilTimeMin / 60)` |
| `grainAbsorptionLossL` | `grainKg * grainAbsorptionLPerKg` |
| `totalWaterL` | `preBoilHotL + grainAbsorptionLossL + mashTunDeadspaceL + spargeVesselDeadspaceL - topUpWaterL`, не ниже 0 |
