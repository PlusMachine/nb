// =============================================================================
//  @nb/brewforge-protocol — telemetry.ts
//  Снимок bf_brew_state_t + конверт (deviceId/fw/ts/seq/uptime/promptSeq).
//  Топик: brewforge/<deviceId>/telemetry (QoS0, retained, ~1 Гц).
//
//  ⚠ НАХОДКА пакета 4-B (сверка с components/comms/bf_proto.c/bf_state.h): поля
//  `hops_acked`/`eta_remaining_min` УЖЕ считает process (components/process/
//  bf_process.c:1131,1135, публикуются в bf_brew_state_t) — ЧЕК-ЛИСТ хмеля §3.2 и
//  ETA варки §C реализованы на устройстве. Но bf_proto_telemetry_json их пока НЕ
//  сериализует в JSON (grep по bf_proto.c — ни "hopsAcked", ни "etaRemainingMin" не
//  встречаются) — это пробел ПРОШИВКИ (вне scope портального пакета, read-only).
//  Здесь их сознательно НЕ добавляем как optional-«заглушку под будущее»: схема
//  должна отражать ФАКТИЧЕСКИЙ провод, а не то, что «скоро появится» — иначе UI-код
//  начнёт молча получать `undefined` и решит, что это «нет данных», хотя на самом
//  деле устройство просто не отправляет уже готовое значение. Добавить оба поля
//  сюда СИНХРОННО с починкой bf_proto_telemetry_json — отдельный тикет прошивки.
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
  // H0 (пакет 4-B): bf_app_mode_t — UI-режим прибора (0 brew/1 distill/2 ferment).
  // optional, потому что старая прошивка (до v11) поле не шлёт вообще. Авторитет
  // режима в running-стадиях — сама stage (17..20 DISTILL_*, 21 FERMENT из
  // STAGE_NAMES); appMode решает ТОЛЬКО в IDLE, где по stage режим не определить.
  appMode: z.number().int().optional(), // числовое значение bf_app_mode_t
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
  // --- P1 (пакет 4-B): bf_proto_telemetry_json шлёт эти поля давно (v6/v9/v10),
  // схема их молча резала (Zod по умолчанию отбрасывает незнакомые поля из
  // z.object) — 2-й насос/клапан/охлаждение ферментации/косвенный нагрев были
  // физически невозможны для показа на дашборде. optional (не .default()), чтобы
  // undefined однозначно читался как «прошивка старее пакета 4-A / поле не
  // прислано», а не «выключено» — UI отличает «нет данных» от «false». Имена и
  // условие отправки сверены 1:1 по bf_proto.c (bf_proto_telemetry_json).
  pump2On: z.boolean().optional(),        // v6: второй насос (роль PUMP2)
  valveOn: z.boolean().optional(),        // v6: клапан (роль VALVE; флегма при дистилляции)
  coolOn: z.boolean().optional(),         // v9: охлаждение (роль COOLER, ферментация)
  indirectActive: z.boolean().optional(), // v10: текущая стадия греет косвенно (HERMS/RIMS)
  hxTempC: z.number().optional(),         // v10: темп. HLT/трубы; ПРИСУТСТВУЕТ, только когда
                                           // hx_valid на устройстве (иначе поле опущено целиком)
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
  nextHopAlert: z.boolean(),        // «мигающий» алёрт — сохранён для обратной совместимости

  // --- §1.6 (пакет 4-B): структурный список внесений хмеля вместо lossy-алёрта
  // выше + «нужно действие оператора» (сейчас — только «смените тару» дистилляции).
  // Тоже давно шлются прошивкой (bf_proto.c), тоже optional по той же причине. ---
  nextHopName: z.string().optional(),  // имя ближайшего ещё НЕ внесённого хмеля ("" = нет)
  nextHopG: z.number().int().optional(),   // его навеска, г
  hopsAlerted: z.number().int().optional(), // битовая маска: для каких хмелей алёрт сработал
  actionReady: z.boolean().optional(), // требуется действие оператора (напр. дистилляция)
  coolLockS: z.number().int().optional(), // анти-короткий-цикл компрессора (ферментация), сек
  hopsAcked: z.number().int().optional(), // маска ПОДТВЕРЖДЁННЫХ внесений (ACK_HOP)
  etaRemainingMin: z.number().int().optional(), // «до конца варки ~», мин (оценка снизу)

  // --- рецепт / статус ---
  activeRecipe: z.number().int(),   // bf_brew_state_t.active_recipe (−1 = нет)
  recipeName: z.string(),
  statusLine: z.string(),
});

export type Telemetry = z.infer<typeof TelemetrySchema>;
