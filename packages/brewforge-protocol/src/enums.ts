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
} as const;

export const FAULT_NAMES = Object.keys(FAULT_BITS) as (keyof typeof FAULT_BITS)[];
export const FaultSchema = z.enum(FAULT_NAMES as [string, ...string[]]);
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

// ----------------------------- Тип команды (bf_cmd_type_t) -----------------
// Числовое значение включает BF_CMD_NONE=0 (для кросс-проверки прошивки);
// CommandTypeSchema исключает NONE — оно не передаётся по проводу.
export const CMD_TYPE_NUM = {
  NONE:            0,  // BF_CMD_NONE
  START_BREW:      1,  // BF_CMD_START_BREW       (arg.i = слот рецепта 0..7)
  PAUSE:           2,  // BF_CMD_PAUSE
  RESUME:          3,  // BF_CMD_RESUME
  STOP:            4,  // BF_CMD_STOP
  ACK_PROMPT:      5,  // BF_CMD_ACK_PROMPT       (arg.ans)
  SKIP_STAGE:      6,  // BF_CMD_SKIP_STAGE
  SELECT_RECIPE:   7,  // BF_CMD_SELECT_RECIPE    (arg.i)
  ENTER_MANUAL:    8,  // BF_CMD_ENTER_MANUAL
  EXIT_MANUAL:     9,  // BF_CMD_EXIT_MANUAL
  MANUAL_SETPOINT: 10, // BF_CMD_MANUAL_SETPOINT  (arg.f °C)
  MANUAL_PWM:      11, // BF_CMD_MANUAL_PWM       (arg.i %)
  MANUAL_HEAT:     12, // BF_CMD_MANUAL_HEAT      (arg.b)
  MANUAL_PUMP:     13, // BF_CMD_MANUAL_PUMP      (arg.b)
  START_AUTOTUNE:  14, // BF_CMD_START_AUTOTUNE
  ESTOP:           15, // BF_CMD_ESTOP
  CLEAR_FAULT:     16, // BF_CMD_CLEAR_FAULT
  SAVE_SETTINGS:   17, // BF_CMD_SAVE_SETTINGS
} as const;

export const COMMAND_TYPE_NAMES = [
  "START_BREW",
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
  "START_AUTOTUNE",
  "ESTOP",
  "CLEAR_FAULT",
  "SAVE_SETTINGS",
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
