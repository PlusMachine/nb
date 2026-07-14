import { describe, expect, it } from "vitest";

import {
  downsampleSeries,
  smoothGravityMedian5,
  splitOnGaps,
  visibleAttenuation,
  type FermentPointCore
} from "./series-core";

// =============================================================================
//  Юнит-тесты series-core — сглаживание/сегментация/даунсемпл/attenuation
//  (§5 F3, §9 M2-B). Без БД, чистое ядро.
// =============================================================================

const HOUR_MS = 3_600_000;

/** Точка-болванка на i-ый час от начала с заданной gravitySg. */
const pt = (hour: number, gravitySg: number | null, overrides: Partial<FermentPointCore> = {}): FermentPointCore => ({
  ts: hour * HOUR_MS,
  gravitySg,
  tempC: null,
  pressureKpa: null,
  excluded: false,
  ...overrides
});

describe("smoothGravityMedian5", () => {
  it("одиночный выброс придавливается медианой окна", () => {
    const points = [pt(0, 1.05), pt(1, 1.049), pt(2, 1.03), pt(3, 1.048), pt(4, 1.047)];
    const smoothed = smoothGravityMedian5(points);
    // окно вокруг индекса 2 (выброс 1.03): [1.05,1.049,1.03,1.048,1.047] → медиана 1.048
    expect(smoothed[2]!.gravitySg).toBeCloseTo(1.048, 5);
    expect(smoothed[2]!.gravitySg).not.toBe(1.03);
  });

  it("граевые точки используют доступное окно меньшего размера", () => {
    const points = [pt(0, 1.05), pt(1, 1.049), pt(2, 1.03), pt(3, 1.048), pt(4, 1.047)];
    const smoothed = smoothGravityMedian5(points);
    // первая точка: окно [pos0..pos2] = [1.05, 1.049, 1.03] → медиана 1.049
    expect(smoothed[0]!.gravitySg).toBeCloseTo(1.049, 5);
    // последняя точка: окно [pos2..pos4] = [1.03, 1.048, 1.047] → медиана 1.047
    expect(smoothed[4]!.gravitySg).toBeCloseTo(1.047, 5);
  });

  it("excluded-точки не влияют на соседей и сами не сглаживаются", () => {
    const points = [
      pt(0, 1.05),
      pt(1, 1.049),
      pt(2, 5.0, { excluded: true }), // явный мусор, исключён
      pt(3, 1.048),
      pt(4, 1.047)
    ];
    const smoothed = smoothGravityMedian5(points);
    // excluded-точка осталась как есть (не сглажена)
    expect(smoothed[2]!.gravitySg).toBe(5.0);
    expect(smoothed[2]!.excluded).toBe(true);
    // соседние точки считают медиану БЕЗ excluded-точки в окне
    // eligible-последовательность: [1.05, 1.049, 1.048, 1.047] (позиции 0,1,3,4 исходного массива)
    // индекс 0 в eligible-списке (сама точка 0): окно pos0..pos2 = [1.05,1.049,1.048] → медиана 1.049
    expect(smoothed[0]!.gravitySg).toBeCloseTo(1.049, 5);
  });

  it("null-гравитация (термоконтроллер) не участвует и не сглаживается", () => {
    const points = [pt(0, 1.05), pt(1, null, { tempC: 19 }), pt(2, 1.048)];
    const smoothed = smoothGravityMedian5(points);
    expect(smoothed[1]!.gravitySg).toBeNull();
    expect(smoothed[1]!.tempC).toBe(19);
  });

  it("пустой массив не падает", () => {
    expect(smoothGravityMedian5([])).toEqual([]);
  });
});

describe("splitOnGaps", () => {
  it("разрыв больше 3× интервала режет серию на сегменты (интервал 900с → порог 2700с)", () => {
    const points = [
      pt(0, 1.05),
      { ts: 900_000, gravitySg: 1.049, tempC: null, pressureKpa: null, excluded: false }, // +900с, в пределах порога
      { ts: 900_000 + 2_701_000, gravitySg: 1.03, tempC: null, pressureKpa: null, excluded: false } // +2701с от предыдущей — разрыв
    ];
    const segments = splitOnGaps(points, 900);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toHaveLength(2);
    expect(segments[1]).toHaveLength(1);
  });

  it("без разрывов — один сегмент", () => {
    const points = [pt(0, 1.05), pt(1, 1.049), pt(2, 1.048)];
    const segments = splitOnGaps(points, 3600);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(3);
  });

  it("интервал неизвестен (null) — порог 3×3600с, консистентно с normalize-core", () => {
    const points = [pt(0, 1.05), pt(10, 1.049), pt(20, 1.048)]; // разрыв 10ч < 3×3600с=3ч? нет — 10ч > 3ч, должен разорвать
    const segments = splitOnGaps(points, null);
    expect(segments.length).toBeGreaterThan(1);
  });

  it("пустой массив — пустой список сегментов", () => {
    expect(splitOnGaps([], 900)).toEqual([]);
  });
});

describe("downsampleSeries", () => {
  it("не трогает серию короче лимита", () => {
    const points = [pt(0, 1.05), pt(1, 1.049)];
    expect(downsampleSeries(points, 600)).toBe(points);
  });

  it("сохраняет одиночный выброс при прореживании длинной серии", () => {
    const points: FermentPointCore[] = [];
    for (let i = 0; i < 1000; i++) {
      points.push(pt(i, 1.05 - i * 0.0001));
    }
    // Одиночный резкий выброс в середине.
    points[500] = pt(500, 1.09, { excluded: false });

    const downsampled = downsampleSeries(points, 100);
    expect(downsampled.length).toBeLessThan(points.length);
    expect(downsampled.some((p) => p.gravitySg === 1.09)).toBe(true);
  });

  it("бакет без ненулевой гравитации отдаёт одну точку (не рвёт температуру)", () => {
    const points: FermentPointCore[] = [];
    for (let i = 0; i < 20; i++) {
      points.push(pt(i, null, { tempC: 19 + i * 0.1 }));
    }
    const downsampled = downsampleSeries(points, 10);
    expect(downsampled.length).toBeGreaterThan(0);
    expect(downsampled.length).toBeLessThanOrEqual(10);
  });
});

describe("visibleAttenuation", () => {
  it("считает по формуле (og-current)/(og-1)*100", () => {
    expect(visibleAttenuation(1.05, 1.01)).toBeCloseTo(80, 1);
  });

  it("og не задан → null", () => {
    expect(visibleAttenuation(null, 1.01)).toBeNull();
  });

  it("current не задан → null", () => {
    expect(visibleAttenuation(1.05, null)).toBeNull();
  });

  it("og ≤ 1 (вода/мусор) → null", () => {
    expect(visibleAttenuation(1, 0.99)).toBeNull();
  });
});
