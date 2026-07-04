// =============================================================================
//  @nb/brewforge-protocol — enums.ts
//  Зеркало числовых значений из прошивки: components/common/include/bf_types.h.
//  ЭТИ значения — машинный контракт. Любая правка enum в bf_types.h должна
//  отражаться здесь 1:1 (порядок = числовое значение, если не указано иное).
// =============================================================================
import { z } from "zod";

/** Версия замороженного протокола (поле `schema` во всех сообщениях). */
export const PROTOCOL_SCHEMA_VERSION = 1 as const;

// ----------------------------- Единицы (bf_units_t) ------------------------
export const UnitsSchema = z.enum(["C", "F"]);
export type Units = z.infer<typeof UnitsSchema>;

// ----------------------------- Стадии (bf_stage_t) -------------------------
// Порядок === числовому значению bf_stage_t (BF_STAGE_IDLE = 0 … BF_STAGE_FAULT).
// stageName в телеметрии === машинное имя (идентификатор enum без BF_STAGE_).
export const STAGE_NAMES = [
  "IDLE",              // 0  BF_STAGE_IDLE
  "DELAYED_START",     // 1  BF_STAGE_DELAYED_START
  "PROMPT_SPARGE",     // 2  BF_STAGE_PROMPT_SPARGE
  "DOUGH_IN",          // 3  BF_STAGE_DOUGH_IN
  "PROMPT_ADD_MALT",   // 4  BF_STAGE_PROMPT_ADD_MALT
  "MASH_STEP",         // 5  BF_STAGE_MASH_STEP
  "MASH_OUT",          // 6  BF_STAGE_MASH_OUT
  "PROMPT_IODINE",     // 7  BF_STAGE_PROMPT_IODINE
  "PROMPT_REMOVE_MALT",// 8  BF_STAGE_PROMPT_REMOVE_MALT
  "BOIL_RAMP",         // 9  BF_STAGE_BOIL_RAMP
  "BOILING",           // 10 BF_STAGE_BOILING
  "HOP_STAND",         // 11 BF_STAGE_HOP_STAND
  "COOLING",           // 12 BF_STAGE_COOLING
  "DONE",              // 13 BF_STAGE_DONE
  "PAUSED",            // 14 BF_STAGE_PAUSED
  "MANUAL",            // 15 BF_STAGE_MANUAL
  "FAULT",             // 16 BF_STAGE_FAULT
  // --- Пакет 4-B (сверка контракта): найдены в bf_types.h, отсутствовали здесь —
  // stageName из телеметрии в этих стадиях падал бы на StageSchema.parse (Zod
  // enum), т.е. ВСЯ телеметрия дистилляции/ферментации не проходила бы валидацию
  // (не «лишнее поле молча режется», а полный отказ кадра — хуже, чем P1-находки). ---
  "DISTILL_PREHEAT",   // 17 BF_STAGE_DISTILL_PREHEAT (Фаза 4: дистилляция)
  "DISTILL_HEADS",     // 18 BF_STAGE_DISTILL_HEADS
  "DISTILL_HEARTS",    // 19 BF_STAGE_DISTILL_HEARTS
  "DISTILL_TAILS",     // 20 BF_STAGE_DISTILL_TAILS
  "FERMENT",           // 21 BF_STAGE_FERMENT (Фаза 4.2: ферментация)
] as const;

export const StageSchema = z.enum(STAGE_NAMES);
export type Stage = z.infer<typeof StageSchema>;

/** Имя → числовое значение bf_stage_t. */
export const STAGE_NUM: Record<Stage, number> = Object.fromEntries(
  STAGE_NAMES.map((name, i) => [name, i]),
) as Record<Stage, number>;

/** Числовое значение bf_stage_t → имя (соответствует bf_stage_name()). */
export function stageName(value: number): Stage {
  const name = STAGE_NAMES[value];
  if (name === undefined) throw new Error(`Unknown bf_stage_t value: ${value}`);
  return name;
}

// ----------------------------- Интерлоки (bf_fault_t) ----------------------
// Битовые значения (1u << n). faultMask — маска; faults[] — декодированный список.
export const FAULT_BITS = {
  SENSOR:       1 << 0, // BF_FAULT_SENSOR
  OVERHEAT_REL: 1 << 1, // BF_FAULT_OVERHEAT_REL
  OVERHEAT_ABS: 1 << 2, // BF_FAULT_OVERHEAT_ABS
  DT_DT:        1 << 3, // BF_FAULT_DT_DT
  FLOAT_DRY:    1 << 4, // BF_FAULT_FLOAT_DRY
  ESTOP:        1 << 5, // BF_FAULT_ESTOP
  WATCHDOG:     1 << 6, // BF_FAULT_WATCHDOG
  STAGE_TO:     1 << 7, // BF_FAULT_STAGE_TO
  NO_FLOW:      1 << 8, // BF_FAULT_NO_FLOW (косвенный нагрев HERMS/RIMS: нет рециркуляции)
} as const;

export const FAULT_NAMES = Object.keys(FAULT_BITS) as (keyof typeof FAULT_BITS)[];
// Каст в тюпл ИМЕННО union-литералов (не голого string) — иначе z.enum схлопывает
// Fault до string, и FAULT_BITS[name] с name:Fault перестаёт тайпчекаться.
export const FaultSchema = z.enum(
  FAULT_NAMES as [keyof typeof FAULT_BITS, ...(keyof typeof FAULT_BITS)[]],
);
export type Fault = z.infer<typeof FaultSchema>;

/** Разложить bf_fault_t-маску в список имён всех установленных бит. */
export function decodeFaults(mask: number): Fault[] {
  return FAULT_NAMES.filter((name) => (mask & FAULT_BITS[name]) !== 0) as Fault[];
}

// ----------------------------- Промпты (bf_prompt_t) -----------------------
export const PROMPT_NAMES = [
  "NONE",           // 0 BF_PROMPT_NONE
  "SPARGE_WATER",   // 1 BF_PROMPT_SPARGE_WATER
  "CONTINUE_DOUGH", // 2 BF_PROMPT_CONTINUE_DOUGH
  "ADD_MALT",       // 3 BF_PROMPT_ADD_MALT
  "IODINE",         // 4 BF_PROMPT_IODINE
  "REMOVE_MALT",    // 5 BF_PROMPT_REMOVE_MALT
  "RESUME_BREW",    // 6 BF_PROMPT_RESUME_BREW
] as const;

export const PromptSchema = z.enum(PROMPT_NAMES);
export type Prompt = z.infer<typeof PromptSchema>;

export const PROMPT_NUM: Record<Prompt, number> = Object.fromEntries(
  PROMPT_NAMES.map((name, i) => [name, i]),
) as Record<Prompt, number>;

export function promptName(value: number): Prompt {
  const name = PROMPT_NAMES[value];
  if (name === undefined) throw new Error(`Unknown bf_prompt_t value: ${value}`);
  return name;
}

// ----------------------------- Ответы (bf_prompt_answer_t) -----------------
export const ANS_NAMES = [
  "NONE",     // 0 BF_ANS_NONE
  "YES",      // 1 BF_ANS_YES
  "NO",       // 2 BF_ANS_NO
  "OK",       // 3 BF_ANS_OK
  "CONTINUE", // 4 BF_ANS_CONTINUE
  "EXTEND",   // 5 BF_ANS_EXTEND
] as const;

export const AnsSchema = z.enum(ANS_NAMES);
export type Ans = z.infer<typeof AnsSchema>;

export const ANS_NUM: Record<Ans, number> = Object.fromEntries(
  ANS_NAMES.map((name, i) => [name, i]),
) as Record<Ans, number>;

/** Допустимые ответы пользователя на промпт (BF_ANS_NONE недопустим в ACK_PROMPT). */
export const PromptAnsSchema = z.enum(["YES", "NO", "OK", "CONTINUE", "EXTEND"]);
export type PromptAns = z.infer<typeof PromptAnsSchema>;

// ----------------------------- Режим нагрева (bf_heat_mode_t) --------------
export const HEAT_MODE_NAMES = [
  "OFF",        // 0 BF_HEAT_OFF
  "PID",        // 1 BF_HEAT_PID
  "BOIL",       // 2 BF_HEAT_BOIL
  "MANUAL_PWM", // 3 BF_HEAT_MANUAL_PWM
  // config v10 (HERMS/RIMS, пакет 4-B): process подменяет ими BF_HEAT_PID ТОЛЬКО в
  // стадиях затирания, когда bf_config_t.heat_method != Off. heatMode в телеметрии —
  // z.number() (не enum), падения парсинга не было; добавлены для heatModeName().
  "HERMS",      // 4 BF_HEAT_HERMS
  "RIMS",       // 5 BF_HEAT_RIMS
] as const;

export const HeatModeSchema = z.enum(HEAT_MODE_NAMES);
export type HeatMode = z.infer<typeof HeatModeSchema>;

export const HEAT_MODE_NUM: Record<HeatMode, number> = Object.fromEntries(
  HEAT_MODE_NAMES.map((name, i) => [name, i]),
) as Record<HeatMode, number>;

export function heatModeName(value: number): HeatMode {
  const name = HEAT_MODE_NAMES[value];
  if (name === undefined) throw new Error(`Unknown bf_heat_mode_t value: ${value}`);
  return name;
}

// ----------------------------- Режим прибора (bf_app_mode_t) ---------------
// Порядок === числовому значению bf_app_mode_t (BF_APP_MODE_BREW = 0 … FERMENT).
// Это UI-слой (v11 прошивки): контур/интерлоки едины для всех режимов, appMode
// лишь подсказывает, какую «зону» рисовать. Авторитет режима в running-стадиях —
// сама стадия (17..20 DISTILL_*, 21 FERMENT из STAGE_NAMES); appMode решает
// только в IDLE, когда по stage режим ещё не определить.
export const APP_MODE_NAMES = [
  "brew",    // 0 BF_APP_MODE_BREW (дефолт)
  "distill", // 1 BF_APP_MODE_DISTILL
  "ferment", // 2 BF_APP_MODE_FERMENT
] as const;

export const AppModeSchema = z.enum(APP_MODE_NAMES);
export type AppMode = z.infer<typeof AppModeSchema>;

export const APP_MODE_NUM: Record<AppMode, number> = Object.fromEntries(
  APP_MODE_NAMES.map((name, i) => [name, i]),
) as Record<AppMode, number>;

export function appModeName(value: number): AppMode {
  const name = APP_MODE_NAMES[value];
  if (name === undefined) throw new Error(`Unknown bf_app_mode_t value: ${value}`);
  return name;
}

// ----------------------------- Тип команды (bf_cmd_type_t) -----------------
// Числовое значение включает BF_CMD_NONE=0 (для кросс-проверки прошивки);
// CommandTypeSchema исключает NONE — оно не передаётся по проводу.
// ⚠ Пакет 4-B: значения ниже сверены заново с components/common/include/bf_types.h —
// BF_CMD_START_DELAYED вставлен в enum СРАЗУ ПОСЛЕ START_BREW (=2), что сдвигает
// ВСЕ последующие значения на +1 относительно прежней (устаревшей) таблицы здесь.
// На САМ провод это не влияет (`type` уходит СТРОКОЙ, cmd_lookup в bf_proto.c
// сравнивает по имени, не по числу) — эти числа чисто справочные для кросс-сверки
// с прошивкой человеком/тестом. Не все значения enum — сетевые: локальные-только
// команды (SET_BINDING/RESET_BINDINGS/SET_SENSOR_STAGE/SET_INPUT_PIN/SIM_*/
// START_DISTILL/START_FERMENT/SET_HX_SENSOR/SET_APP_MODE — bf_types.h §"config-model"
// и §"Фаза 4") сюда намеренно не включены — см. PHASE2-4_PLAN.md §2.4 «Локальные-
// только команды», их портал никогда не отправляет.
// ⚠ Пакет №2 §13: MANUAL_PUMP2/MANUAL_VALVE/MANUAL_COOL (Этап 6-A прошивки) вставлены
// в enum СРАЗУ ПОСЛЕ MANUAL_PUMP (=14), сдвигая START_AUTOTUNE..ACK_HOP на +3; следом
// FORCE_PUMP/FORCE_PUMP2/FORCE_VALVE (Этап 6-D) дописаны В КОНЕЦ enum. И то, и то —
// сетевые команды (есть в CMD_MAP bf_proto.c), но с разной гейтовкой в process:
//  MANUAL_PUMP2/VALVE/COOL — принимаются ТОЛЬКО в BF_STAGE_MANUAL (сбрасываются
//    при входе/выходе из ручного режима, как MANUAL_PUMP);
//  FORCE_PUMP/PUMP2/VALVE — принимаются в ЛЮБОЙ стадии, КРОМЕ BF_STAGE_FAULT
//    (латч поверх автологики; портал команды не строит — билдеры в command.ts
//    только для кросс-проверки/будущего H4, UI на них не выводить, см. TASK §13).
export const CMD_TYPE_NUM = {
  NONE:            0,  // BF_CMD_NONE
  START_BREW:      1,  // BF_CMD_START_BREW       (arg.i = слот рецепта 0..25)
  START_DELAYED:   2,  // BF_CMD_START_DELAYED    (arg.i = задержка старта, минут)
  PAUSE:           3,  // BF_CMD_PAUSE
  RESUME:          4,  // BF_CMD_RESUME
  STOP:            5,  // BF_CMD_STOP
  ACK_PROMPT:      6,  // BF_CMD_ACK_PROMPT       (arg.ans)
  SKIP_STAGE:      7,  // BF_CMD_SKIP_STAGE
  SELECT_RECIPE:   8,  // BF_CMD_SELECT_RECIPE    (arg.i)
  ENTER_MANUAL:    9,  // BF_CMD_ENTER_MANUAL
  EXIT_MANUAL:     10, // BF_CMD_EXIT_MANUAL
  MANUAL_SETPOINT: 11, // BF_CMD_MANUAL_SETPOINT  (arg.f °C)
  MANUAL_PWM:      12, // BF_CMD_MANUAL_PWM       (arg.i %)
  MANUAL_HEAT:     13, // BF_CMD_MANUAL_HEAT      (arg.b)
  MANUAL_PUMP:     14, // BF_CMD_MANUAL_PUMP      (arg.b)
  MANUAL_PUMP2:    15, // BF_CMD_MANUAL_PUMP2     (arg.b) — только BF_STAGE_MANUAL
  MANUAL_VALVE:    16, // BF_CMD_MANUAL_VALVE     (arg.b) — только BF_STAGE_MANUAL
  MANUAL_COOL:     17, // BF_CMD_MANUAL_COOL      (arg.b) — только BF_STAGE_MANUAL
  START_AUTOTUNE:  18, // BF_CMD_START_AUTOTUNE
  ESTOP:           19, // BF_CMD_ESTOP
  CLEAR_FAULT:     20, // BF_CMD_CLEAR_FAULT
  SAVE_SETTINGS:   21, // BF_CMD_SAVE_SETTINGS
  // 22..35 — локальные-только команды (не в этом списке, см. комментарий выше).
  ACK_HOP:         36, // BF_CMD_ACK_HOP (arg.i = индекс хмеля) — добавлена в CMD_MAP
                        // пакетом 4-A прошивки; единственная сетевая из «старых» новых.
  FORCE_PUMP:      37, // BF_CMD_FORCE_PUMP  (arg.b) — любая стадия, кроме FAULT
  FORCE_PUMP2:     38, // BF_CMD_FORCE_PUMP2 (arg.b) — любая стадия, кроме FAULT
  FORCE_VALVE:     39, // BF_CMD_FORCE_VALVE (arg.b) — любая стадия, кроме FAULT
} as const;

export const COMMAND_TYPE_NAMES = [
  "START_BREW",
  "START_DELAYED",
  "SELECT_RECIPE",
  "PAUSE",
  "RESUME",
  "STOP",
  "SKIP_STAGE",
  "ACK_PROMPT",
  "ENTER_MANUAL",
  "EXIT_MANUAL",
  "MANUAL_SETPOINT",
  "MANUAL_PWM",
  "MANUAL_HEAT",
  "MANUAL_PUMP",
  "MANUAL_PUMP2",
  "MANUAL_VALVE",
  "MANUAL_COOL",
  "START_AUTOTUNE",
  "ESTOP",
  "CLEAR_FAULT",
  "SAVE_SETTINGS",
  "ACK_HOP",
  "FORCE_PUMP",
  "FORCE_PUMP2",
  "FORCE_VALVE",
] as const;

export const CommandTypeSchema = z.enum(COMMAND_TYPE_NAMES);
export type CommandType = z.infer<typeof CommandTypeSchema>;

// ----------------------------- Вирпул (push рецепта §6.1) ------------------
export const WhirlpoolSchema = z.enum(["off", "hot", "cool"]);
export type Whirlpool = z.infer<typeof WhirlpoolSchema>;

// ----------------------------- Причина ack/nack ----------------------------
// bf_cmd_send возвращает false при валидации/переполнении очереди; мост/гейтинг
// удалённого нагрева добавляют REMOTE_DISABLED/RATE_LIMITED/REJECTED_INTERLOCK.
export const AckReasonSchema = z.enum([
  "OK",
  "QUEUE_FULL",
  "VALIDATION",
  "REJECTED_INTERLOCK",
  "REMOTE_DISABLED",
  "RATE_LIMITED",
]);
export type AckReason = z.infer<typeof AckReasonSchema>;
