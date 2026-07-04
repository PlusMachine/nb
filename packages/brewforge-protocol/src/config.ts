// =============================================================================
//  @nb/brewforge-protocol — config.ts
//  Настраиваемый (НЕсекретный) конфиг прошивки §6.2/§6.3 — зеркало JSON, который
//  прошивка отдаёт по GET /config (под ключом "config") и принимает по PUT /config.
//  Источник имён — сериализатор bf_config_to_cjson (components/comms/bf_proto.c).
//
//  ВАЖНО (инвариант безопасности): клампинг каждого поля в безопасный диапазон —
//  на УСТРОЙСТВЕ (bf_config_parse_json_clamped), а интерлоки §5 удалённо ослабить
//  нельзя (потолки overshootCut/absMax/maxDt/sensorFaultCycles вшиты в прошивку).
//  Поэтому здесь схема НЕ навязывает диапазоны (чтобы не отклонять значение, которое
//  устройство приняло бы и клампнуло), а лишь фиксирует ФОРМУ и типы. Диапазоны для
//  UI вынесены отдельно в CONFIG_FIELD_RANGES.
//
//  units сериализуется ЧИСЛОМ (bf_units_t: 0=C, 1=F) — это не строковый UnitsSchema
//  из enums.ts (тот для рецепта). Объекты помечены .passthrough(), чтобы расширение
//  прошивки новым полем не ломало round-trip GET→PUT.
// =============================================================================
import { z } from "zod";

/** bf_units_t: 0 = °C, 1 = °F (в /config единицы — число, не строка "C"/"F"). */
export const DeviceUnitsSchema = z.union([z.literal(0), z.literal(1)]);
export type DeviceUnits = z.infer<typeof DeviceUnitsSchema>;

/** pid_mash{} — качество регулирования (НЕ интерлок). */
export const PidConfigSchema = z
  .object({
    kp: z.number(),
    ki: z.number(),
    kd: z.number(),
    sampleMs: z.number(),
    windowMs: z.number(),
    pidStartBandC: z.number(),
    ponMeasurement: z.boolean(), // false = PonE (дефолт), true = PonM
  })
  .passthrough();
export type PidConfig = z.infer<typeof PidConfigSchema>;

/** pump{} — циклы/отдых/стоп-темп насоса. */
export const PumpConfigSchema = z
  .object({
    cycleMin: z.number(),
    restMin: z.number(),
    stopTempC: z.number(),
    primeCycles: z.number(),
    paddleMode: z.boolean(),
    heatDuringRest: z.boolean(),
  })
  .passthrough();
export type PumpConfig = z.infer<typeof PumpConfigSchema>;

/** boil{} — кипячение (ручной ШИМ после выхода на boil.tempC). */
export const BoilConfigSchema = z
  .object({
    tempC: z.number(),
    heatPct: z.number(),
  })
  .passthrough();
export type BoilConfig = z.infer<typeof BoilConfigSchema>;

/** safety{} — пороги интерлоков §5 (клампы-потолки вшиты в прошивку). */
export const SafetyConfigSchema = z
  .object({
    overshootCutC: z.number(),
    absMaxC: z.number(),
    maxDtPerSec: z.number(),
    sensorFaultCycles: z.number(),
    stageTimeoutMin: z.number(),
  })
  .passthrough();
export type SafetyConfig = z.infer<typeof SafetyConfigSchema>;

/** sensorCal[i] — 2-точечная калибровка датчика (scale/offset). */
export const SensorCalSchema = z
  .object({
    scale: z.number(),
    offset: z.number(),
  })
  .passthrough();
export type SensorCal = z.infer<typeof SensorCalSchema>;

/**
 * distill{} — профиль дистилляции (v7 пороги фракций + v8 флегма), §13 контракта.
 * В отличие от pid/pump/boil/safety выше, здесь Zod САМ навязывает диапазоны —
 * зеркало клампов bf_config_sanitize (components/common/bf_config.c в brewforge).
 * Отступление осознанное: эти поля ещё нигде на портале не редактируются (пакет №3), и цель —
 * ловить контрактные баги на границе портала, а не эмулировать безопасный клампинг
 * устройства (тот остаётся на устройстве, инвариант §6.2 не нарушается: диапазоны
 * Zod здесь ПОВТОРЯЮТ клампы устройства, но не заменяют и не ослабляют их).
 */
export const DistillConfigSchema = z
  .object({
    headsPct: z.number().int().min(0).max(100),
    heartsPct: z.number().int().min(0).max(100),
    tailsPct: z.number().int().min(0).max(100),
    tHeadsC: z.number().min(30).max(110),
    tHeartsC: z.number().min(30).max(110),
    tTailsC: z.number().min(30).max(110),
    tEndC: z.number().min(30).max(110),
    headsReflux: z.number().int().min(0).max(30),
    heartsReflux: z.number().int().min(0).max(30),
    tailsReflux: z.number().int().min(0).max(30),
    refluxWindowS: z.number().int().min(5).max(300),
  })
  .passthrough();
export type DistillConfig = z.infer<typeof DistillConfigSchema>;

/**
 * ferment.steps[i] — одна ступень профиля брожения (bf_ferment_step_t). Имена
 * ступеней прибор НЕ хранит (см. docs/brewforge-web-hmi.md §13) — только tempC/
 * hours; hours=0 значит «держать до ручного перехода», это валидный ввод.
 */
export const FermentStepSchema = z
  .object({
    tempC: z.number().min(-2).max(40),
    hours: z.number().int().min(0).max(8760),
  })
  .passthrough();
export type FermentStep = z.infer<typeof FermentStepSchema>;

/** ferment{} — контур + профиль брожения (v9), §13 контракта. См. DistillConfigSchema про диапазоны в Zod. */
export const FermentConfigSchema = z
  .object({
    hysteresisC: z.number().min(0.1).max(5),
    compMinOffS: z.number().int().min(0).max(1800),
    compMinOnS: z.number().int().min(0).max(1800),
    heatEnabled: z.boolean(),
    nSteps: z.number().int().min(1).max(6),
    steps: z.array(FermentStepSchema).max(6),
  })
  .passthrough();
export type FermentConfig = z.infer<typeof FermentConfigSchema>;

/**
 * Полный НЕсекретный конфиг устройства — то, что лежит под ключом "config" в
 * ответах GET /config и PUT /config. .passthrough() сохраняет неизвестные поля
 * (forward-compat: прошивка может добавить поле, round-trip его не потеряет).
 *
 * ferment/distill/appMode — .optional(): старая прошивка (config < v7/v9/v11) или
 * частичный ответ их не пришлёт; отсутствие не должно валить весь round-trip.
 */
export const DeviceConfigSchema = z
  .object({
    units: DeviceUnitsSchema,
    pid: PidConfigSchema,
    pump: PumpConfigSchema,
    boil: BoilConfigSchema,
    safety: SafetyConfigSchema,
    filterBeta: z.number(),
    interHeaterDelayMs: z.number(),
    buzzer: z.boolean(),
    spargeHeating: z.boolean(),
    iodineTest: z.boolean(),
    removeMaltPrompt: z.boolean(),
    sensorCal: z.array(SensorCalSchema),
    ferment: FermentConfigSchema.optional(),
    distill: DistillConfigSchema.optional(),
    // bf_app_mode_t: 0=BREW, 1=DISTILL, 2=FERMENT (BF_APP_MODE__COUNT=3).
    appMode: z.number().int().min(0).max(2).optional(),
  })
  .passthrough();
export type DeviceConfig = z.infer<typeof DeviceConfigSchema>;

/**
 * Патч конфига для PUT /config: прошивка принимает ЛЮБОЕ подмножество полей на
 * каждом уровне вложенности (cfg_ovr_* переопределяет лишь присутствующие поля),
 * поэтому это «глубокий partial». Используется для валидации тела запроса и как
 * тип входа writeConfig/putConfig. Полный DeviceConfig тоже проходит эту схему.
 *
 * ВАЖНО (сверено с bf_config_parse_json_clamped, bf_proto.c 2026-07-03, пакет H3):
 * прошивка читает по сети units/pid/pump/boil/safety/filterBeta/interHeaterDelayMs/
 * buzzer/spargeHeating/iodineTest/removeMaltPrompt/sensorCal И (с пакета H3) секции
 * ferment{}/distill{} — те применяются ЖИВЬЁМ (NVS → внутренняя BF_CMD_RELOAD_PROFILES
 * → process перечитывает обе секции; step_index клампится, уставка — на следующем
 * тике), диапазоны на устройстве ровняет bf_config_sanitize — те же клампы, что
 * зашиты в Zod-схемы выше. appMode прошивка из PUT НЕ читает ОСОЗНАННО: смена режима
 * — только локально с устройства (§2 контракта); поле в схеме — для round-trip
 * (GET отдаёт его, парсер не должен ронять кадр конфига).
 */
export const DeviceConfigPatchSchema = z
  .object({
    units: DeviceUnitsSchema.optional(),
    pid: PidConfigSchema.partial().optional(),
    pump: PumpConfigSchema.partial().optional(),
    boil: BoilConfigSchema.partial().optional(),
    safety: SafetyConfigSchema.partial().optional(),
    filterBeta: z.number().optional(),
    interHeaterDelayMs: z.number().optional(),
    buzzer: z.boolean().optional(),
    spargeHeating: z.boolean().optional(),
    iodineTest: z.boolean().optional(),
    removeMaltPrompt: z.boolean().optional(),
    sensorCal: z.array(SensorCalSchema.partial()).optional(),
    ferment: FermentConfigSchema.partial().extend({
      steps: z.array(FermentStepSchema.partial()).max(6).optional(),
    }).optional(),
    distill: DistillConfigSchema.partial().optional(),
    appMode: z.number().int().min(0).max(2).optional(),
  })
  .passthrough();
export type DeviceConfigPatch = z.infer<typeof DeviceConfigPatchSchema>;

// =============================================================================
//  CONFIG_FIELD_RANGES — метаданные полей для рендера формы настроек на портале.
//  Диапазоны = реальные клампы прошивки (bf_config_parse_json_clamped) сверенные с
//  PHASE1_SPEC.md §6.3. Это ПОДСКАЗКА для UI; финальный клампинг — на устройстве.
//  Ключ — dotted-path поля (sensorCal.* — общий дескриптор для элементов массива).
// =============================================================================
export type ConfigFieldDescriptor =
  | {
      kind: "number";
      label: string;
      min: number;
      max: number;
      step: number;
      unit?: string;
    }
  | { kind: "bool"; label: string }
  | { kind: "enum"; label: string; options: ReadonlyArray<{ value: number; label: string }> };

export const CONFIG_FIELD_RANGES = {
  units: {
    kind: "enum",
    label: "Единицы температуры",
    options: [
      { value: 0, label: "°C" },
      { value: 1, label: "°F" },
    ],
  },

  "pid.kp": { kind: "number", label: "Kp", min: 0, max: 1000, step: 1 },
  "pid.ki": { kind: "number", label: "Ki", min: 0, max: 100, step: 0.1 },
  "pid.kd": { kind: "number", label: "Kd", min: 0, max: 1000, step: 1 },
  "pid.sampleMs": { kind: "number", label: "Период PID", min: 1500, max: 3500, step: 100, unit: "мс" },
  "pid.windowMs": { kind: "number", label: "Окно ШИМ", min: 4000, max: 7500, step: 100, unit: "мс" },
  "pid.pidStartBandC": { kind: "number", label: "Полоса старта PID", min: 1.0, max: 3.5, step: 0.1, unit: "°C" },
  "pid.ponMeasurement": { kind: "bool", label: "PID по измерению (PonM)" },

  "pump.cycleMin": { kind: "number", label: "Цикл насоса", min: 5, max: 15, step: 1, unit: "мин" },
  "pump.restMin": { kind: "number", label: "Отдых насоса", min: 0, max: 5, step: 1, unit: "мин" },
  "pump.stopTempC": { kind: "number", label: "Стоп-темп. насоса", min: 80, max: 120, step: 1, unit: "°C" },
  "pump.primeCycles": { kind: "number", label: "Прокачки на старте", min: 0, max: 10, step: 1 },
  "pump.paddleMode": { kind: "bool", label: "Непрерывное перемешивание" },
  "pump.heatDuringRest": { kind: "bool", label: "Греть на отдыхе насоса" },

  "boil.tempC": { kind: "number", label: "Темп. кипения", min: 80, max: 120, step: 0.5, unit: "°C" },
  "boil.heatPct": { kind: "number", label: "Мощность кипения", min: 0, max: 100, step: 1, unit: "%" },

  "safety.overshootCutC": { kind: "number", label: "Срез относит. перегрева", min: 1, max: 10, step: 0.5, unit: "°C" },
  "safety.absMaxC": { kind: "number", label: "Абсолютный потолок", min: 90, max: 108, step: 1, unit: "°C" },
  "safety.maxDtPerSec": { kind: "number", label: "Макс. dT/dt", min: 0.5, max: 5, step: 0.1, unit: "°C/с" },
  "safety.sensorFaultCycles": { kind: "number", label: "Циклы отказа датчика", min: 1, max: 10, step: 1 },
  "safety.stageTimeoutMin": { kind: "number", label: "Таймаут стадии", min: 1, max: 600, step: 1, unit: "мин" },

  filterBeta: { kind: "number", label: "Бета фильтра", min: 0.1, max: 1.0, step: 0.05 },
  interHeaterDelayMs: { kind: "number", label: "Задержка между ТЭНами", min: 10, max: 1000, step: 10, unit: "мс" },
  buzzer: { kind: "bool", label: "Зуммер" },
  spargeHeating: { kind: "bool", label: "Нагрев промывочной воды" },
  iodineTest: { kind: "bool", label: "Йодная проба" },
  removeMaltPrompt: { kind: "bool", label: "Промпт «удалить солод»" },

  "sensorCal.scale": { kind: "number", label: "Калибровка: масштаб", min: 0.8, max: 1.25, step: 0.01 },
  "sensorCal.offset": { kind: "number", label: "Калибровка: смещение", min: -5, max: 5, step: 0.1, unit: "°C" },

  // --- ferment{}/distill{} (v9/v7-8): диапазоны сверены с bf_config_sanitize
  // (packages/common/bf_config.c), НЕ с bf_config_parse_json_clamped — тот эти
  // поля из сети пока не читает (см. комментарий у DeviceConfigPatchSchema).
  // Дескрипторы без ступеней (ferment.steps[] — массив, редактор ступеней вне
  // рамок этого пакета, см. docs/brewforge-web-hmi.md §13) и НЕ подключены к
  // device-config-form.tsx (GROUPS) — задел на будущий пульт ферментации/дистилляции.
  "ferment.hysteresisC": { kind: "number", label: "Гистерезис", min: 0.1, max: 5, step: 0.1, unit: "°C" },
  "ferment.compMinOffS": { kind: "number", label: "Компрессор: мин. простой", min: 0, max: 1800, step: 30, unit: "с" },
  "ferment.compMinOnS": { kind: "number", label: "Компрессор: мин. работа", min: 0, max: 1800, step: 30, unit: "с" },
  "ferment.heatEnabled": { kind: "bool", label: "Нагрев разрешён" },
  "ferment.nSteps": { kind: "number", label: "Ступеней в профиле", min: 1, max: 6, step: 1 },

  "distill.headsPct": { kind: "number", label: "Мощность отбора: головы", min: 0, max: 100, step: 1, unit: "%" },
  "distill.heartsPct": { kind: "number", label: "Мощность отбора: тело", min: 0, max: 100, step: 1, unit: "%" },
  "distill.tailsPct": { kind: "number", label: "Мощность отбора: хвосты", min: 0, max: 100, step: 1, unit: "%" },
  "distill.tHeadsC": { kind: "number", label: "Порог: преднагрев → головы", min: 30, max: 110, step: 0.5, unit: "°C" },
  "distill.tHeartsC": { kind: "number", label: "Порог: головы → тело", min: 30, max: 110, step: 0.5, unit: "°C" },
  "distill.tTailsC": { kind: "number", label: "Порог: тело → хвосты", min: 30, max: 110, step: 0.5, unit: "°C" },
  "distill.tEndC": { kind: "number", label: "Порог: авто-стоп", min: 30, max: 110, step: 0.5, unit: "°C" },
  "distill.headsReflux": { kind: "number", label: "Флегмовое число: головы", min: 0, max: 30, step: 1 },
  "distill.heartsReflux": { kind: "number", label: "Флегмовое число: тело", min: 0, max: 30, step: 1 },
  "distill.tailsReflux": { kind: "number", label: "Флегмовое число: хвосты", min: 0, max: 30, step: 1 },
  "distill.refluxWindowS": { kind: "number", label: "Окно цикла клапана отбора", min: 5, max: 300, step: 5, unit: "с" },
} as const satisfies Record<string, ConfigFieldDescriptor>;

/** Ключи CONFIG_FIELD_RANGES (dotted-path настраиваемых полей). */
export type ConfigFieldKey = keyof typeof CONFIG_FIELD_RANGES;
