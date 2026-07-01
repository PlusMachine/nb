// =============================================================================
//  @nb/brewforge-protocol — telemetry.ts
//  Снимок bf_brew_state_t + конверт (deviceId/fw/ts/seq/uptime/promptSeq).
//  Топик: brewforge/<deviceId>/telemetry (QoS0, retained, ~1 Гц).
// =============================================================================
import { z } from "zod";
import {
  PROTOCOL_SCHEMA_VERSION,
  StageSchema,
} from "./enums.js";

/** Одно показание датчика: bf_brew_state_t.temp_c[i] / temp_valid[i]. */
export const SensorReadingSchema = z.object({
  i: z.number().int().min(0),        // индекс датчика 0..BF_MAX_SENSORS-1
  c: z.number(),                     // температура, °C
  valid: z.boolean(),                // прошёл CRC/диапазон/N циклов
});
export type SensorReading = z.infer<typeof SensorReadingSchema>;

/** Первичный датчик стадии: primary_temp_c / primary_valid. */
export const PrimaryReadingSchema = z.object({
  c: z.number(),
  valid: z.boolean(),
});
export type PrimaryReading = z.infer<typeof PrimaryReadingSchema>;

export const TelemetrySchema = z.object({
  // --- конверт ---
  schema: z.literal(PROTOCOL_SCHEMA_VERSION),
  deviceId: z.string(),
  fw: z.string(),
  ts: z.number().int(),              // SNTP wall-clock, секунды
  seq: z.number().int(),            // монотонный счётчик (дедуп/детект пропусков)
  uptime: z.number().int(),         // секунды с загрузки

  // --- стадия / интерлоки (bf_brew_state_t) ---
  stage: z.number().int(),          // числовое значение bf_stage_t
  stageName: StageSchema,           // машинное имя (bf_stage_name())
  pausedFrom: z.number().int(),     // bf_stage_t куда вернуться из PAUSED
  faultMask: z.number().int(),      // битовая маска bf_fault_t — АВТОРИТЕТНЫЙ источник
  // Информационный список кодов от устройства. Намеренно z.string(), а НЕ z.enum:
  // авторитет — faultMask (UI декодирует через decodeFaults), а один незнакомый/новый
  // код от прошивки не должен ронять весь кадр телеметрии (иначе дашборд гаснет в offline).
  faults: z.array(z.string()),
  heatingPermitted: z.boolean(),    // интерлоки разрешают нагрев

  // --- датчики ---
  sensors: z.array(SensorReadingSchema),
  primary: PrimaryReadingSchema,

  // --- выходы / контур ---
  setpointC: z.number(),
  heatMode: z.number().int(),       // числовое значение bf_heat_mode_t
  heatDutyPct: z.number().int(),    // целевая скважность окна, %
  heatOn: z.boolean(),              // мгновенное состояние основного SSR
  spargeHeatOn: z.boolean(),
  pumpOn: z.boolean(),
  boilPct: z.number().int(),        // отображаемая скважность кипения

  // --- таймеры / индексы ---
  stageRemainingSec: z.number().int(),
  stageElapsedSec: z.number().int(),
  mashStepIndex: z.number().int(),
  nMashSteps: z.number().int(),
  hopStandIndex: z.number().int(),

  // --- промпты ---
  prompt: z.number().int(),         // числовое значение bf_prompt_t
  promptSeq: z.number().int(),      // инкремент при смене промпта (идемпотентный ack)
  nextHopAlert: z.boolean(),

  // --- рецепт / статус ---
  activeRecipe: z.number().int(),   // bf_brew_state_t.active_recipe (−1 = нет)
  recipeName: z.string(),
  statusLine: z.string(),
});

export type Telemetry = z.infer<typeof TelemetrySchema>;
