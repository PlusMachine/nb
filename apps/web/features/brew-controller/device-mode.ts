// =============================================================================
//  features/brew-controller/device-mode.ts
//  Режим пульта = «зеркало платы» (редизайн L2 §1.2/§6; веб-HMI §2/§5). Прибор
//  мультирежимный (варка / дистилляция / ферментация) — режим ЭТО состояние из
//  телеметрии, а не тип устройства, поэтому итог здесь — пара:
//   - appMode  — ЧТО прибор сейчас варит/гонит/бродит (brew/distill/ferment);
//   - activity — ЧТО с ним сейчас происходит (offline/idle/auto/manual/fault),
//                прежний deriveDeviceMode — колл-сайты не трогаем.
//  Чистый модуль без побочных эффектов — client-safe, тестируемый.
// =============================================================================
import { appModeName, STAGE_NAMES, STAGE_NUM, type AppMode, type Stage, type Telemetry } from "@nb/brewforge-protocol";

export type { AppMode };

// Подпись режима прибора для бейджа в хедере пульта (L2 §5) и плитки устройства
// (L1 §4) — один словарь на оба места, компонентам самим ничего не придумывать.
export const APP_MODE_LABELS: Record<AppMode, string> = {
  brew: "Варка",
  distill: "Дистилляция",
  ferment: "Ферментация",
};

/**
 *  Состояние устройства, которое отражает пульт:
 *   - "offline" — нет свежей телеметрии, состояние платы неизвестно;
 *   - "idle"    — простой/готово: пивоварня свободна (точка входа в варку, §7);
 *   - "auto"    — идёт авто-варка по флоу стадий (засыпь→…→охлаждение), §1.2;
 *   - "manual"  — ручной режим (override уставки/мощности/насоса);
 *   - "fault"   — плата остановлена по аварии (стадия FAULT).
 */
export type DeviceMode = "offline" | "idle" | "auto" | "manual" | "fault";

// Стадии простоя: пивоварня свободна. DONE (варка завершена) трактуем как простой
// — точка входа для новой варки; сам факт «готово» показывает профиль-полоса.
const IDLE_STAGES: Stage[] = ["IDLE", "DONE"];

/**
 * Выводит режим пульта из снимка телеметрии. Приоритет: нет живого кадра →
 * offline; стадия FAULT → fault; MANUAL → manual; IDLE/DONE → idle; иначе идёт
 * авто-варка → auto. Свежесть (`isLive`) считает владелец SSE-подписки —
 * при устаревании/офлайне режим неизвестен (UI не притворяется, что знает плату).
 *
 * Аварии ВНУТРИ варки (faultMask при auto/manual) — это баннер (AlarmsPanel), а
 * НЕ режим: mode остаётся auto/manual, поэтому здесь смотрим только на стадию.
 */
export function deriveDeviceMode(
  telemetry: Pick<Telemetry, "stageName"> | null,
  isLive: boolean,
): DeviceMode {
  if (!isLive || telemetry === null) return "offline";
  if (telemetry.stageName === "FAULT") return "fault";
  if (telemetry.stageName === "MANUAL") return "manual";
  if (IDLE_STAGES.includes(telemetry.stageName)) return "idle";
  return "auto";
}

// Стадии, ПО КОТОРЫМ прибор однозначно гонит/бродит — авторитет режима в самой
// стадии (спека §5), appMode из телеметрии здесь не нужен и не смотрится.
const DISTILL_STAGES: Stage[] = ["DISTILL_PREHEAT", "DISTILL_HEADS", "DISTILL_HEARTS", "DISTILL_TAILS"];
const FERMENT_STAGE: Stage = "FERMENT";

/** Численный bf_stage_t → Stage без throw (pausedFrom может прийти «сырым»). */
function stageNameSafe(value: number): Stage | null {
  return STAGE_NAMES[value] ?? null;
}

/** Running-стадия → её appMode; для варочных/idle-стадий — null (режим не по стадии). */
function stageAppMode(stage: Stage | null): AppMode | null {
  if (stage === null) return null;
  if (DISTILL_STAGES.includes(stage)) return "distill";
  if (stage === FERMENT_STAGE) return "ferment";
  return null;
}

/**
 * Выводит РЕЖИМ ПРИБОРА (что варит/гонит/бродит) из снимка телеметрии.
 * Приоритет: нет телеметрии → null; running-стадии дистилляции (17–20) →
 * "distill"; FERMENT (21) → "ferment"; PAUSED/FAULT смотрят `pausedFrom` по тем
 * же правилам (пауза/авария дистилляции/ферментации не должна «переключать»
 * пульт обратно в варку); иначе — `appMode` из телеметрии, если прошивка его
 * шлёт (v11+); иначе "brew" (дефолт прошивки для старых кадров без поля).
 */
export function deriveAppMode(
  telemetry: Pick<Telemetry, "stageName" | "pausedFrom" | "appMode"> | null,
): AppMode | null {
  if (telemetry === null) return null;
  const { stageName, pausedFrom, appMode } = telemetry;

  const effectiveStage =
    stageName === "PAUSED" || stageName === "FAULT" ? stageNameSafe(pausedFrom) : stageName;

  const runningMode = stageAppMode(effectiveStage);
  if (runningMode) return runningMode;

  if (appMode !== undefined) return appModeName(appMode);
  return "brew";
}

/** Полное состояние устройства для пульта: режим + активность (§5). */
export type DeviceState = { appMode: AppMode | null; activity: DeviceMode };

/** Свод deriveAppMode + deriveDeviceMode в одну пару для колл-сайтов, которым нужно и то, и другое. */
export function deriveDeviceState(
  telemetry: Pick<Telemetry, "stageName" | "pausedFrom" | "appMode"> | null,
  isLive: boolean,
): DeviceState {
  return {
    appMode: deriveAppMode(telemetry),
    activity: deriveDeviceMode(telemetry, isLive),
  };
}

// =============================================================================
//  Бейдж плитки L1 (веб-HMI §4.2). Плитка знает только ЧИСЛОВОЙ snapshot.stage
//  (last-known срез из tiles.ts, без stageName/pausedFrom) — поэтому это отдельный,
//  более грубый вывод, чем deriveAppMode: IDLE/DONE всегда «Свободен» ДАЖЕ если
//  snapshot.appMode уже указывает на дистилляцию/ферментацию (сам режим — дело
//  пульта L2, см. DeviceHeader; плитка лишь сигналит «прибор занят чем-то ещё»).
// =============================================================================
const TILE_FREE_STAGES: number[] = [STAGE_NUM.IDLE, STAGE_NUM.DONE];
const TILE_DISTILL_STAGES: number[] = [
  STAGE_NUM.DISTILL_PREHEAT,
  STAGE_NUM.DISTILL_HEADS,
  STAGE_NUM.DISTILL_HEARTS,
  STAGE_NUM.DISTILL_TAILS,
];

/**
 * Подпись бейджа плитки L1 по last-known snapshot.stage (+ pausedFrom — честный
 * бейдж на паузе/аварии, ревью H0 §4.2). Приоритет: нет стадии (истории ещё
 * нет) → бейджа нет; IDLE/DONE → «Свободен»; running-дистилляция (17–20) →
 * «Дистилляция»; FERMENT (21) → «Ферментация»; MANUAL → «Ручной»; PAUSED/FAULT
 * сами по себе не варочные — резолвим по pausedFrom (куда вернётся FSM) теми же
 * правилами (17–20 → «Дистилляция», 21 → «Ферментация», иначе/null/неизвестный
 * → «Варка»); иначе (сами варочные стадии) → «Варка».
 */
export function deriveTileBadge(stage: number | null, pausedFrom?: number | null): string | null {
  if (stage === null) return null;
  if (TILE_FREE_STAGES.includes(stage)) return "Свободен";
  if (TILE_DISTILL_STAGES.includes(stage)) return APP_MODE_LABELS.distill;
  if (stage === STAGE_NUM.FERMENT) return APP_MODE_LABELS.ferment;
  if (stage === STAGE_NUM.MANUAL) return "Ручной";
  const resolvedStage = stage === STAGE_NUM.PAUSED || stage === STAGE_NUM.FAULT ? pausedFrom ?? null : stage;
  if (resolvedStage !== null && TILE_DISTILL_STAGES.includes(resolvedStage)) return APP_MODE_LABELS.distill;
  if (resolvedStage === STAGE_NUM.FERMENT) return APP_MODE_LABELS.ferment;
  return APP_MODE_LABELS.brew;
}
