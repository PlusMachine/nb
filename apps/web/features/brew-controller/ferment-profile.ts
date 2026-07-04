// =============================================================================
//  features/brew-controller/ferment-profile.ts
//  Чистое ядро пульта ферментации (веб-HMI §8/§13, H3): профиль брожения живёт в
//  конфиге прибора (`ferment.steps[]`, до 6 ступеней; `hours=0` = держать до
//  ручного перехода) — имена ступеней прибор НЕ хранит. Здесь — модель прогресса
//  (список ступеней done/current/future + «день N из M» текущей) и best-effort
//  сопоставление с планом брожения рецепта (`fermentationPlan` из
//  brewPlanSnapshot), плюс маппинг plan→ferment.steps для «Из плана рецепта».
//
//  Без React/DOM/сети — тестируется юнитами, переиспользуется компонентом
//  (ferment-dashboard-view.tsx). Источник шага прогресса — `mashStepIndex`
//  телеметрии: прошивка в FERMENT зеркалит в него индекс текущей ступени
//  брожения (§13-№6, тот же приём, что и mashStepIndex варки для пауз затора).
// =============================================================================
import type { FermentConfig, FermentStep } from "@nb/brewforge-protocol";

const HOURS_PER_DAY = 24;
const SECONDS_PER_DAY = 86_400;

/** Прибор принимает максимум 6 ступеней профиля брожения (ferment.nSteps ≤ 6, §13). */
export const MAX_FERMENT_STEPS = 6;

/** Допуск сравнения температур план↔прибор при опознавании имён ступеней, °C. */
const TEMP_MATCH_TOLERANCE_C = 0.25;

/**
 * Активные ступени профиля из «сырого» ferment{}: устройство ВСЕГДА шлёт
 * фиксированный 6-слотовый `steps[]` (bf_proto.c сериализует весь массив
 * независимо от `nSteps`, §13/sim-device.ts) — `nSteps` выбирает, сколько
 * ведущих слотов реальны, «хвост» — незадействованный заполнитель. Пульт
 * обязан резать по `nSteps` ВЕЗДЕ, где показывает/пишет профиль как список
 * ступеней — иначе список/график тянут фантомные шаги, а «изменить уставку»
 * (которая шлёт этот же обрезанный список назад с `nSteps: steps.length`)
 * молча расширяет активный профиль на приборе до 6 ступеней.
 */
export function activeFermentSteps(config: Pick<FermentConfig, "steps" | "nSteps">): FermentStep[] {
  const n = Math.max(0, Math.min(Math.round(config.nSteps), config.steps.length));
  return config.steps.slice(0, n);
}

// --- локальные читатели «сырого» JSON-плана (тот же приём, что brew-day.ts/
// translator.ts — колокированные чистые хелперы, без общего «any-парсера»). ---
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readNumber = (record: Record<string, unknown>, key: string): number | null => {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const readString = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

/** Дни плана → часы прибора (ferment.steps[i].hours), округление до целого. Нет/≤0 дней → 0 (держать вручную). */
function daysToHours(days: number | null): number {
  if (days === null || !Number.isFinite(days) || days <= 0) return 0;
  return Math.round(days * HOURS_PER_DAY);
}

// =============================================================================
//  Маппинг плана брожения рецепта → ступени прибора (§13, для «Из плана рецепта»)
// =============================================================================

/** Одна ступень плана после маппинга — с именем (прибор имена не хранит). */
export type MappedFermentStep = { name: string; tempC: number; hours: number };

export type FermentPlanMappingResult =
  | { ok: true; steps: MappedFermentStep[] }
  | { ok: false; error: string };

/**
 * Маппинг `processMeta.fermentationProfile` (в снапшоте партии — `fermentationPlan`,
 * `Record<string, unknown>`) → ступени прибора: [главное брожение] + extraSteps
 * (пропускаем те, где не задана температура — грузить в прибор нечего) +
 * холодная выдержка, ЕСЛИ `coldCrash.enabled`. `conditioning` НЕ грузится — это
 * созревание уже ПОСЛЕ розлива, прибор в бутылках/кегах не участвует.
 *
 * Честная ошибка при >6 ступеней (MAX_FERMENT_STEPS) — не молчаливая обрезка;
 * при отсутствии/нечитаемом плане или неизвестной температуре главного брожения
 * тоже честный `ok:false` (нечего мапить), а не пустой список.
 */
export function mapFermentationPlanToDeviceSteps(fermentationPlan: unknown): FermentPlanMappingResult {
  if (!isRecord(fermentationPlan)) {
    return { ok: false, error: "План брожения недоступен" };
  }

  const primaryTempC = readNumber(fermentationPlan, "primaryTemperatureC");
  if (primaryTempC === null) {
    return { ok: false, error: "В плане не задана температура главного брожения" };
  }
  const primaryDays = readNumber(fermentationPlan, "primaryDurationDays");

  const steps: MappedFermentStep[] = [
    { name: "Главное брожение", tempC: primaryTempC, hours: daysToHours(primaryDays) },
  ];

  const extraSteps = Array.isArray(fermentationPlan.extraSteps) ? fermentationPlan.extraSteps : [];
  extraSteps.forEach((raw, index) => {
    if (!isRecord(raw)) return;
    const tempC = readNumber(raw, "temperatureC");
    if (tempC === null) return; // без температуры ступень не грузится в прибор
    const days = readNumber(raw, "durationDays");
    const name = readString(raw, "name") ?? `Шаг ${index + 1}`;
    steps.push({ name, tempC, hours: daysToHours(days) });
  });

  const coldCrash = isRecord(fermentationPlan.coldCrash) ? fermentationPlan.coldCrash : null;
  if (coldCrash && coldCrash.enabled === true) {
    const tempC = readNumber(coldCrash, "temperatureC");
    if (tempC !== null) {
      const days = readNumber(coldCrash, "durationDays");
      steps.push({ name: "Холодная выдержка", tempC, hours: daysToHours(days) });
    }
  }
  // conditioning — намеренно НЕ читаем (см. баннер файла).

  if (steps.length > MAX_FERMENT_STEPS) {
    return { ok: false, error: `В приборе максимум ${MAX_FERMENT_STEPS} ступеней (в плане ${steps.length})` };
  }

  return { ok: true, steps };
}

/**
 * Совпадает ли профиль прибора с планом (для опознавания имён ступеней, §13):
 * то же число ступеней И температуры совпадают в пределах допуска. Порядок
 * ступеней плана и прибора считаем уже согласованным (маппинг детерминирован).
 */
export function stepsMatchPlan(deviceSteps: FermentStep[], planSteps: MappedFermentStep[]): boolean {
  if (deviceSteps.length === 0 || deviceSteps.length !== planSteps.length) return false;
  return deviceSteps.every((step, i) => Math.abs(step.tempC - planSteps[i]!.tempC) <= TEMP_MATCH_TOLERANCE_C);
}

/**
 * Подписи ступеней прибора: имена плана — ТОЛЬКО если план опознан (stepsMatchPlan),
 * иначе честные «Ступень N» (прибор имён не хранит, best-effort — не гадание).
 */
export function resolveStepLabels(deviceSteps: FermentStep[], planSteps?: MappedFermentStep[] | null): string[] {
  if (planSteps && stepsMatchPlan(deviceSteps, planSteps)) {
    return planSteps.map((step) => step.name);
  }
  return deviceSteps.map((_, i) => `Ступень ${i + 1}`);
}

// =============================================================================
//  Модель прогресса профиля (карточка «Профиль брожения» + герой пульта)
// =============================================================================

export type FermentStepState = "done" | "current" | "future";

export type FermentStepView = {
  index: number;
  tempC: number;
  /** 0 = держать до ручного перехода («Дальше» с портала/устройства). */
  hours: number;
  label: string;
  state: FermentStepState;
};

export type FermentProgress = {
  steps: FermentStepView[];
  current: FermentStepView | null;
  /** Ступень после текущей — null, если текущей нет или она последняя. */
  next: FermentStepView | null;
  /** «день N из M» текущей ступени либо «держится вручную» (hours=0); null — нет текущей ступени. */
  dayLabel: string | null;
};

const emptyProgress: FermentProgress = { steps: [], current: null, next: null, dayLabel: null };

/**
 * Собрать модель прогресса из ступеней конфига (`ferment.steps[]`) + индекса
 * текущей ступени/наработки из телеметрии. `currentIndex` — `mashStepIndex`
 * телеметрии, но ТОЛЬКО когда прибор реально в FERMENT (вызывающая сторона
 * решает это по deriveAppMode/stageName — здесь просто индекс или null/-1/
 * вне диапазона, что трактуется одинаково как «текущей ступени нет»).
 */
export function buildFermentProgress(params: {
  steps: FermentStep[];
  currentIndex: number | null | undefined;
  /** stageElapsedSec телеметрии — наработка ТЕКУЩЕЙ ступени (сбрасывается на переходе, как у пауз затора). */
  elapsedSec: number;
  /** Best-effort имена из плана брожения партии (см. mapFermentationPlanToDeviceSteps). */
  planSteps?: MappedFermentStep[] | null;
}): FermentProgress {
  const { steps, currentIndex, elapsedSec, planSteps } = params;
  if (steps.length === 0) return emptyProgress;

  const labels = resolveStepLabels(steps, planSteps);
  const validCurrent =
    currentIndex !== null && currentIndex !== undefined && currentIndex >= 0 && currentIndex < steps.length
      ? currentIndex
      : null;

  const views: FermentStepView[] = steps.map((step, i) => ({
    index: i,
    tempC: step.tempC,
    hours: step.hours,
    label: labels[i] ?? `Ступень ${i + 1}`,
    state: validCurrent === null ? "future" : i < validCurrent ? "done" : i === validCurrent ? "current" : "future",
  }));

  const current = validCurrent !== null ? views[validCurrent]! : null;
  const next = validCurrent !== null ? views[validCurrent + 1] ?? null : null;

  let dayLabel: string | null = null;
  if (current) {
    if (current.hours === 0) {
      dayLabel = "держится вручную";
    } else {
      const totalDays = Math.ceil(current.hours / HOURS_PER_DAY);
      const elapsedDays = Math.floor(Math.max(0, elapsedSec) / SECONDS_PER_DAY) + 1;
      const day = Math.min(elapsedDays, totalDays);
      dayLabel = `день ${day} из ${totalDays}`;
    }
  }

  return { steps: views, current, next, dayLabel };
}

/** «7 дн» / «1.5 дн» / «до ручного перехода» (hours=0) — для карточки «Профиль брожения». */
export function formatStepDurationDays(hours: number): string {
  if (hours <= 0) return "до ручного перехода";
  const days = Math.round((hours / HOURS_PER_DAY) * 10) / 10;
  return `${Number.isInteger(days) ? days : days.toFixed(1)} дн`;
}
