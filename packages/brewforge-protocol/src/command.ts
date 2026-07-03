// =============================================================================
//  @nb/brewforge-protocol — command.ts
//  Команда портал/мост → устройство (1:1 на bf_cmd_t) + ack/nack.
//  Топики: brewforge/<deviceId>/cmd (QoS1), .../cmd/ack (QoS1).
//
//  КРИТИЧНО: arg кладётся в нужный «член union» bf_cmd_t:
//    MANUAL_SETPOINT → arg.f,  MANUAL_PWM/START_BREW/SELECT_RECIPE → arg.i,
//    MANUAL_HEAT/MANUAL_PUMP → arg.b,  ACK_PROMPT → arg.ans.
//  Хелперы-билдеры ниже гарантируют корректное размещение.
// =============================================================================
import { z } from "zod";
import {
  CommandTypeSchema,
  PromptAnsSchema,
  AckReasonSchema,
  type CommandType,
  type PromptAns,
} from "./enums.js";

/** Аргумент команды — отражение union bf_cmd_t.arg + promptSeq для идемпотентности. */
export const CommandArgSchema = z
  .object({
    i: z.number().int().optional(),   // целочисленный аргумент (слот / %)
    f: z.number().optional(),         // вещественный аргумент (°C)
    b: z.boolean().optional(),        // булев аргумент (вкл/выкл)
    ans: PromptAnsSchema.optional(),  // ответ на промпт (ACK_PROMPT)
    promptSeq: z.number().int().optional(), // идемпотентный ack по promptSeq телеметрии
  })
  .strict();
export type CommandArg = z.infer<typeof CommandArgSchema>;

export const CommandSchema = z.object({
  id: z.string(),                     // uuid команды (ack ссылается на него через ackOf)
  ts: z.number().int(),               // время отправки, секунды
  auth: z.string().optional(),        // per-device токен (опционален для LAN-REST)
  type: CommandTypeSchema,
  arg: CommandArgSchema.optional(),
});
export type Command = z.infer<typeof CommandSchema>;

export const AckSchema = z.object({
  ackOf: z.string(),                  // id команды, на которую отвечаем
  ok: z.boolean(),
  reason: AckReasonSchema,
  ts: z.number().int(),
});
export type Ack = z.infer<typeof AckSchema>;

// ----------------------------- Билдеры -------------------------------------
// Все генерируют валидные Command с уникальным id и текущим ts (секунды).

const newId = (): string => globalThis.crypto.randomUUID();
const nowSec = (): number => Math.floor(Date.now() / 1000);

function makeCommand(type: CommandType, arg?: CommandArg, auth?: string): Command {
  const cmd: Command = { id: newId(), ts: nowSec(), type };
  if (arg !== undefined) cmd.arg = arg;
  if (auth !== undefined) cmd.auth = auth;
  return cmd;
}

export const cmdStartBrew = (slot: number, auth?: string): Command =>
  makeCommand("START_BREW", { i: slot }, auth);

/** BF_CMD_START_DELAYED — отложенный старт: arg.i = задержка в минутах. Греющая
 *  команда (гейтится opt-in'ом remote_control_enabled, как START_BREW/RESUME). */
export const cmdStartDelayed = (delayMinutes: number, auth?: string): Command =>
  makeCommand("START_DELAYED", { i: delayMinutes }, auth);

export const cmdSelectRecipe = (slot: number, auth?: string): Command =>
  makeCommand("SELECT_RECIPE", { i: slot }, auth);

export const cmdPause = (auth?: string): Command => makeCommand("PAUSE", undefined, auth);
export const cmdResume = (auth?: string): Command => makeCommand("RESUME", undefined, auth);
export const cmdStop = (auth?: string): Command => makeCommand("STOP", undefined, auth);
export const cmdSkipStage = (auth?: string): Command =>
  makeCommand("SKIP_STAGE", undefined, auth);

export const cmdAck = (ans: PromptAns, promptSeq?: number, auth?: string): Command =>
  makeCommand("ACK_PROMPT", promptSeq === undefined ? { ans } : { ans, promptSeq }, auth);

export const cmdEnterManual = (auth?: string): Command =>
  makeCommand("ENTER_MANUAL", undefined, auth);
export const cmdExitManual = (auth?: string): Command =>
  makeCommand("EXIT_MANUAL", undefined, auth);

export const cmdManualSetpoint = (c: number, auth?: string): Command =>
  makeCommand("MANUAL_SETPOINT", { f: c }, auth);
export const cmdManualPwm = (pct: number, auth?: string): Command =>
  makeCommand("MANUAL_PWM", { i: pct }, auth);
export const cmdManualHeat = (on: boolean, auth?: string): Command =>
  makeCommand("MANUAL_HEAT", { b: on }, auth);
export const cmdManualPump = (on: boolean, auth?: string): Command =>
  makeCommand("MANUAL_PUMP", { b: on }, auth);

export const cmdStartAutotune = (auth?: string): Command =>
  makeCommand("START_AUTOTUNE", undefined, auth);
export const cmdEstop = (auth?: string): Command => makeCommand("ESTOP", undefined, auth);
export const cmdClearFault = (auth?: string): Command =>
  makeCommand("CLEAR_FAULT", undefined, auth);
export const cmdSaveSettings = (auth?: string): Command =>
  makeCommand("SAVE_SETTINGS", undefined, auth);

/** BF_CMD_ACK_HOP — подтвердить внесение хмеля удалённо («Гид по хмелю»,
 *  arg.i = индекс хмеля 0..BF_MAX_HOPS-1). Не «греющая» — без gate/rate-limit. */
export const cmdAckHop = (hopIndex: number, auth?: string): Command =>
  makeCommand("ACK_HOP", { i: hopIndex }, auth);
