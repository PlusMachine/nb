// =============================================================================
//  features/brew-controller/distill-console.ts
//  Чистое ядро пульта дистилляции (веб-HMI §7, H2): резолв датчика колонны
//  (localStorage-ключ + валидация индекса против sensors[] — сама работа с
//  localStorage остаётся в компоненте, здесь только SSR-safe чистые функции),
//  детект «перегон реально идёт» (для ветвления distill-дашборда, §12.1: идле-
//  дистиллятор остаётся на LiveDashboardView — решение оркестратора), и
//  динамический текст подтверждения перехода к следующей фракции (SKIP_STAGE,
//  §13-№4) + таймер текущей фракции.
//
//  Без React/DOM/сети — тестируется юнитами, переиспользуется
//  distill-dashboard-view.tsx.
// =============================================================================
import { STAGE_NAMES, type Stage, type Telemetry } from "@nb/brewforge-protocol";

// =============================================================================
//  Датчик колонны — v1 клиентское назначение (localStorage), §7.
//  Серверное поле (per-device, переживает смену браузера/устройства) — v2,
//  см. openIssues отчёта H2.
// =============================================================================

/** Ключ localStorage: назначенный индекс датчика колонны, per-device. */
export function columnSensorStorageKey(deviceId: string): string {
  return `nb_distill_column_sensor_${deviceId}`;
}

/** Сырое значение localStorage → индекс датчика (целое ≥0) либо null (не задан/битое значение). */
export function parseColumnSensorIndex(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Индекс реально присутствует среди датчиков ТЕКУЩЕГО кадра (устройство могло сменить состав). */
export function isValidColumnSensorIndex(sensors: { i: number }[], index: number): boolean {
  return sensors.some((s) => s.i === index);
}

/**
 * Сырое значение localStorage → валидный индекс датчика колонны либо null.
 * Составляет parse + валидацию против текущего sensors[] в одну точку входа
 * для компонента: «назначен, но датчика с таким индексом больше нет» трактуется
 * как «не назначен» (герой честно покажет только куб, §7), а не как выдумка.
 */
export function resolveColumnSensorIndex(raw: string | null, sensors: { i: number }[]): number | null {
  const parsed = parseColumnSensorIndex(raw);
  if (parsed === null) return null;
  return isValidColumnSensorIndex(sensors, parsed) ? parsed : null;
}

/** Показание назначенного датчика колонны из текущего кадра, либо null (не назначен/датчика нет в кадре). */
export function resolveColumnReading(
  sensors: { i: number; c: number; valid: boolean }[] | undefined,
  columnSensorIndex: number | null,
): { c: number; valid: boolean } | null {
  if (columnSensorIndex === null || !sensors) return null;
  const sensor = sensors.find((s) => s.i === columnSensorIndex);
  return sensor ? { c: sensor.c, valid: sensor.valid } : null;
}

// =============================================================================
//  Фракции дистилляции (bf_stage_t 17..20) — переход/таймер/detect «идёт ли перегон».
// =============================================================================

/** Стадии-«срезы» дистилляции, по которым «К следующей фракции» (SKIP_STAGE) вообще имеет смысл. */
export type DistillFractionStage = Extract<
  Stage,
  "DISTILL_PREHEAT" | "DISTILL_HEADS" | "DISTILL_HEARTS" | "DISTILL_TAILS"
>;

const DISTILL_FRACTION_STAGES: readonly DistillFractionStage[] = [
  "DISTILL_PREHEAT",
  "DISTILL_HEADS",
  "DISTILL_HEARTS",
  "DISTILL_TAILS",
];

export function isDistillFractionStage(stage: Stage | null | undefined): stage is DistillFractionStage {
  return stage != null && (DISTILL_FRACTION_STAGES as readonly Stage[]).includes(stage);
}

/** Численный bf_stage_t → Stage без throw (pausedFrom может прийти «сырым»). */
function stageNameSafe(value: number): Stage | null {
  return STAGE_NAMES[value] ?? null;
}

/**
 * Перегон реально идёт (не просто «прибор в режиме дистилляции» — тот бывает и
 * в IDLE, §12.1: такой идле-дистиллятор остаётся на LiveDashboardView, решение
 * оркестратора). PAUSED/FAULT смотрят pausedFrom — пауза/авария внутри перегона
 * не должна «выкидывать» с дашборда дистилляции.
 */
export function isDistillRunning(telemetry: Pick<Telemetry, "stageName" | "pausedFrom"> | null): boolean {
  if (!telemetry) return false;
  const effective =
    telemetry.stageName === "PAUSED" || telemetry.stageName === "FAULT"
      ? stageNameSafe(telemetry.pausedFrom)
      : telemetry.stageName;
  return isDistillFractionStage(effective);
}

// Заголовок подтверждения перехода — по TЕКУЩЕЙ фракции (куда денется SKIP_STAGE,
// см. bf_process.c:607-619: PREHEAT→HEADS→HEARTS→TAILS→DONE).
const NEXT_FRACTION_CONFIRM_TITLE: Record<DistillFractionStage, string> = {
  DISTILL_PREHEAT: "Завершить разогрев и начать отбор голов?",
  DISTILL_HEADS: "Завершить отбор голов и начать отбор тела?",
  DISTILL_HEARTS: "Завершить отбор тела и начать отбор хвостов?",
  DISTILL_TAILS: "Завершить отбор хвостов и перегон?",
};

/** Текст подтверждения перехода к следующей фракции (§7) — null вне фракционных стадий (кнопки не показываем вовсе). */
export function nextFractionConfirmTitle(stage: Stage | null | undefined): string | null {
  return isDistillFractionStage(stage) ? NEXT_FRACTION_CONFIRM_TITLE[stage] : null;
}

/** Пояснение под заголовком подтверждения — нагрев не прерывается, кроме перехода в DONE (там гаснет). */
export function nextFractionConfirmDescription(stage: Stage | null | undefined): string {
  return stage === "DISTILL_TAILS"
    ? "Устройство завершит перегон и выключит нагрев."
    : "Устройство сразу переключит контур на следующую фракцию — нагрев не прерывается.";
}

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** «разогрев идёт 1:42» / «отбор идёт 1:42» — null вне фракционных стадий. */
export function fractionElapsedLabel(stage: Stage | null | undefined, stageElapsedSec: number): string | null {
  if (!isDistillFractionStage(stage)) return null;
  const verb = stage === "DISTILL_PREHEAT" ? "разогрев идёт" : "отбор идёт";
  return `${verb} ${fmtClock(stageElapsedSec)}`;
}
