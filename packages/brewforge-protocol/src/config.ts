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
 * Полный НЕсекретный конфиг устройства — то, что лежит под ключом "config" в
 * ответах GET /config и PUT /config. .passthrough() сохраняет неизвестные поля
 * (forward-compat: прошивка может добавить поле, round-trip его не потеряет).
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
  })
  .passthrough();
export type DeviceConfig = z.infer<typeof DeviceConfigSchema>;

/**
 * Патч конфига для PUT /config: прошивка принимает ЛЮБОЕ подмножество полей на
 * каждом уровне вложенности (cfg_ovr_* переопределяет лишь присутствующие поля),
 * поэтому это «глубокий partial». Используется для валидации тела запроса и как
 * тип входа writeConfig/putConfig. Полный DeviceConfig тоже проходит эту схему.
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
} as const satisfies Record<string, ConfigFieldDescriptor>;

/** Ключи CONFIG_FIELD_RANGES (dotted-path настраиваемых полей). */
export type ConfigFieldKey = keyof typeof CONFIG_FIELD_RANGES;
