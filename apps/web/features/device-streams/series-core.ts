import { calculateApparentAttenuation } from "@nb/brewing-core";

import { staleThresholdMs } from "./normalize-core";

// =============================================================================
//  features/device-streams — series-core.ts
//  Чистое ядро чтения серии одного сеанса ферментации для графика (§5 F3, §9).
//  Вход — точки уже с применённым calibration_offset_sg (офсет применяет
//  series.ts на чтении из БД, §П3) и известный интервал устройства. Хранение
//  сырое — сглаживание/разрывы/даунсемпл делаются только на чтении. Без
//  побочных импортов (@nb/db и т.п.) — колокированный тест гоняется без БД,
//  конвенция *-core.ts (см. parse-core.ts, normalize-core.ts).
// =============================================================================

/** Точка серии сеанса (уже со сдвигом по calibration_offset_sg, если это gravitySg с устройства). */
export type FermentPointCore = {
  /** Мс-эпоха. */
  ts: number;
  gravitySg: number | null;
  tempC: number | null;
  pressureKpa: number | null;
  excluded: boolean;
};

const MEDIAN_WINDOW_HALF = 2; // окно из 5 точек = 2 соседа с каждой стороны + сама точка

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/**
 * Скользящая медиана по 5 точкам ПО gravitySg (§F3, П2: хранение сырое,
 * сглаживание только на чтении). excluded-точки и точки с null-гравитацией не
 * входят в окно соседей и сами не сглаживаются (остаются как есть — их рисуют
 * отдельно/полупрозрачно, а не как часть сглаженной кривой). Граничные точки —
 * медиана доступного окна меньшего размера (несимметричное окно у краёв серии).
 */
export const smoothGravityMedian5 = (points: FermentPointCore[]): FermentPointCore[] => {
  const eligibleIndices: number[] = [];
  points.forEach((point, index) => {
    if (!point.excluded && point.gravitySg !== null) {
      eligibleIndices.push(index);
    }
  });

  const smoothedByIndex = new Map<number, number>();
  eligibleIndices.forEach((pointIndex, position) => {
    const from = Math.max(0, position - MEDIAN_WINDOW_HALF);
    const to = Math.min(eligibleIndices.length - 1, position + MEDIAN_WINDOW_HALF);
    const windowValues: number[] = [];
    for (let k = from; k <= to; k++) {
      windowValues.push(points[eligibleIndices[k]!]!.gravitySg!);
    }
    smoothedByIndex.set(pointIndex, median(windowValues));
  });

  return points.map((point, index) => {
    const smoothed = smoothedByIndex.get(index);
    return smoothed === undefined ? point : { ...point, gravitySg: smoothed };
  });
};

/**
 * Разбить серию на сегменты по разрывам данных >3× интервал (П4) — разрыв
 * линии на графике, БЕЗ интерполяции. Интервал неизвестен → те же 3×3600с, что
 * normalize-core.staleThresholdMs (единый порог «ветхости» во всей фиче).
 * Точки должны прийти отсортированными по ts по возрастанию.
 */
export const splitOnGaps = (points: FermentPointCore[], intervalSeconds: number | null): FermentPointCore[][] => {
  if (points.length === 0) return [];

  const gapThresholdMs = staleThresholdMs(intervalSeconds);
  const segments: FermentPointCore[][] = [];
  let current: FermentPointCore[] = [points[0]!];

  for (let i = 1; i < points.length; i++) {
    const gapMs = points[i]!.ts - points[i - 1]!.ts;
    if (gapMs > gapThresholdMs) {
      segments.push(current);
      current = [];
    }
    current.push(points[i]!);
  }
  segments.push(current);
  return segments;
};

/**
 * Прореживание для отрисовки: если точек больше maxPoints — бьём на бакеты и
 * из каждого берём точки с мин/макс gravitySg (обе, если разные), чтобы
 * выбросы не пропадали с графика (в отличие от обычного «каждую N-ю»).
 * Бакет без ни одной точки с ненулевой gravitySg — отдаём одну любую точку
 * бакета (не рвём линию температуры/давления там, где плотности нет).
 */
export const downsampleSeries = (points: FermentPointCore[], maxPoints = 600): FermentPointCore[] => {
  if (points.length <= maxPoints) return points;

  const bucketCount = Math.max(1, Math.floor(maxPoints / 2));
  const bucketSize = points.length / bucketCount;
  const result: FermentPointCore[] = [];

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = Math.floor(bucket * bucketSize);
    const end = bucket === bucketCount - 1 ? points.length : Math.floor((bucket + 1) * bucketSize);
    if (start >= end) continue;

    let minPoint = points[start]!;
    let maxPoint = points[start]!;
    for (let i = start; i < end; i++) {
      const value = points[i]!.gravitySg;
      if (value === null) continue;
      if (minPoint.gravitySg === null || value < minPoint.gravitySg) minPoint = points[i]!;
      if (maxPoint.gravitySg === null || value > maxPoint.gravitySg) maxPoint = points[i]!;
    }

    if (minPoint === maxPoint) {
      result.push(minPoint);
    } else if (minPoint.ts <= maxPoint.ts) {
      result.push(minPoint, maxPoint);
    } else {
      result.push(maxPoint, minPoint);
    }
  }

  return result;
};

/**
 * Видимая степень сбраживания: (og−current)/(og−1)×100 — та же формула, что
 * calculateApparentAttenuation из @nb/brewing-core (переиспользуем, не
 * дублируем), только вместо подтверждённого FG — текущее показание. og/current
 * не заданы или og≤1 (вода/мусор, деление на ноль или знак меняется) → null.
 */
export const visibleAttenuation = (og: number | null, current: number | null): number | null => {
  if (og === null || current === null) return null;
  if (og <= 1) return null;
  return calculateApparentAttenuation(og, current);
};
