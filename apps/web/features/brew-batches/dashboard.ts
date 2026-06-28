import type { BrewBatchStatus } from "./contracts";

// Чистая логика «следующего шага» для активной варки на дашборде. Без БД/React и
// без чтения текущего времени внутри — `now` передаётся, чтобы хелпер был
// детерминирован и тестируем. Рендерится в server-компоненте (текст без
// форматирования дат), поэтому TZ-расхождений гидрации нет.

export type BrewNudgeTone = "action" | "warn" | "info";

export type BrewNudge = {
  tone: BrewNudgeTone;
  text: string;
};

// Брожение без свежего замера дольше этого числа дней → подсказка «пора FG».
export const STALE_MEASUREMENT_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

const daysBetween = (from: Date, to: Date): number =>
  Math.floor((to.getTime() - from.getTime()) / DAY_MS);

/** Русское склонение слова «день» по числу: 1 день, 2 дня, 5 дней. */
export const russianDays = (n: number): string => {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) {
    return "дней";
  }
  if (last === 1) {
    return "день";
  }
  if (last >= 2 && last <= 4) {
    return "дня";
  }
  return "дней";
};

export type BrewNudgeInput = {
  status: BrewBatchStatus;
  plannedFor: Date | null;
  startedAt: Date | null;
  createdAt: Date;
  lastMeasurementAt: Date | null;
  measurementCount: number;
};

/**
 * Подсказка следующего действия по активной варке. Завершённые/отменённые на
 * дашборд не попадают, поэтому обрабатываем три активных статуса; для прочих —
 * пустой info (страховка типов).
 */
export const resolveBrewNudge = (item: BrewNudgeInput, now: Date): BrewNudge => {
  switch (item.status) {
    case "planned": {
      if (item.plannedFor && item.plannedFor.getTime() <= now.getTime()) {
        return { tone: "action", text: "Пора начинать варку" };
      }
      if (item.plannedFor) {
        return { tone: "info", text: "Запланирована" };
      }
      return { tone: "info", text: "Готова к старту" };
    }
    case "brewing": {
      if (item.measurementCount === 0) {
        return { tone: "action", text: "Запишите начальную плотность (OG)" };
      }
      return { tone: "info", text: "Идёт варка" };
    }
    case "fermenting": {
      if (item.measurementCount === 0) {
        return { tone: "action", text: "Запишите начальную плотность (OG)" };
      }
      const since = item.lastMeasurementAt ?? item.startedAt ?? item.createdAt;
      const days = Math.max(daysBetween(since, now), 0);
      if (days >= STALE_MEASUREMENT_DAYS) {
        return { tone: "warn", text: `${days} ${russianDays(days)} без замера — проверьте FG` };
      }
      return { tone: "info", text: "Брожение идёт" };
    }
    default:
      return { tone: "info", text: "" };
  }
};
