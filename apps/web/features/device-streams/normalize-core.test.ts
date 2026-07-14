import { describe, expect, it } from "vitest";

import { isStale, normalizeStreamPacket, staleThresholdMs } from "./normalize-core";
import type { ParsedStreamPacket } from "./parse-core";

// =============================================================================
//  Юнит-тесты normalize-core — единицы/клампы/ветхость (§8.3, П4).
// =============================================================================

/** Пакет-болванка со всеми null — тесты переопределяют только нужные поля. */
const basePacket: ParsedStreamPacket = {
  format: "ispindel",
  name: null,
  gravityRaw: null,
  gravityUnitHint: null,
  temperatureRaw: null,
  temperatureUnitHint: null,
  pressureRaw: null,
  pressureUnitHint: null,
  batteryRaw: null,
  rssi: null,
  intervalSeconds: null,
  sourceTs: null
};

describe("normalizeStreamPacket — плотность", () => {
  it("эвристика без hint: 30.29 (значение >1.2) → Plato → SG ≈1.1306", () => {
    const result = normalizeStreamPacket({ ...basePacket, gravityRaw: 30.29, gravityUnitHint: null });
    expect(result.gravitySg).toBeCloseTo(1.1306, 4);
  });

  it("эвристика без hint: 1.048 (значение ≤1.2) → уже SG, как есть", () => {
    const result = normalizeStreamPacket({ ...basePacket, gravityRaw: 1.048, gravityUnitHint: null });
    expect(result.gravitySg).toBe(1.048);
  });

  it("граница эвристики: 1.2 включительно трактуется как SG (не Plato)", () => {
    const result = normalizeStreamPacket({ ...basePacket, gravityRaw: 1.2, gravityUnitHint: null });
    expect(result.gravitySg).toBe(1.2);
  });

  it("граница эвристики: 1.2000001 трактуется уже как Plato", () => {
    const result = normalizeStreamPacket({ ...basePacket, gravityRaw: 1.2000001, gravityUnitHint: null });
    expect(result.gravitySg).not.toBe(1.2000001);
    expect(result.gravitySg).toBeGreaterThan(1);
  });

  it("явный hint 'plato' конвертирует независимо от величины", () => {
    const result = normalizeStreamPacket({ ...basePacket, gravityRaw: 12.4, gravityUnitHint: "plato" });
    expect(result.gravitySg).toBeCloseTo(1.0501, 4);
  });

  it("явный hint 'sg' оставляет как есть", () => {
    const result = normalizeStreamPacket({ ...basePacket, gravityRaw: 1.048, gravityUnitHint: "sg" });
    expect(result.gravitySg).toBe(1.048);
  });

  it("gravityRaw null → gravitySg null", () => {
    const result = normalizeStreamPacket({ ...basePacket, gravityRaw: null });
    expect(result.gravitySg).toBeNull();
  });
});

describe("normalizeStreamPacket — температура", () => {
  it("hint 'f': 68.5°F → ~20.28°C", () => {
    const result = normalizeStreamPacket({ ...basePacket, temperatureRaw: 68.5, temperatureUnitHint: "f" });
    expect(result.tempC).toBeCloseTo(20.28, 2);
  });

  it("hint 'c': значение не меняется", () => {
    const result = normalizeStreamPacket({ ...basePacket, temperatureRaw: 19.2, temperatureUnitHint: "c" });
    expect(result.tempC).toBe(19.2);
  });

  it("hint отсутствует: трактуется как °C (как есть)", () => {
    const result = normalizeStreamPacket({ ...basePacket, temperatureRaw: 21.44, temperatureUnitHint: null });
    expect(result.tempC).toBe(21.44);
  });
});

describe("normalizeStreamPacket — давление", () => {
  it("hint 'psi' конвертирует в кПа (×6.8948)", () => {
    const result = normalizeStreamPacket({ ...basePacket, pressureRaw: 14.5, pressureUnitHint: "psi" });
    expect(result.pressureKpa).toBeCloseTo(99.9746, 4);
  });

  it("hint 'kpa' или отсутствует — значение как есть", () => {
    const withHint = normalizeStreamPacket({ ...basePacket, pressureRaw: 101.3, pressureUnitHint: "kpa" });
    expect(withHint.pressureKpa).toBe(101.3);

    const withoutHint = normalizeStreamPacket({ ...basePacket, pressureRaw: 0, pressureUnitHint: null });
    expect(withoutHint.pressureKpa).toBe(0);
  });

  it("pressureRaw null → pressureKpa null", () => {
    const result = normalizeStreamPacket({ ...basePacket, pressureRaw: null });
    expect(result.pressureKpa).toBeNull();
  });
});

describe("normalizeStreamPacket — батарея", () => {
  it("4.03 (≤6) → вольты", () => {
    const result = normalizeStreamPacket({ ...basePacket, batteryRaw: 4.03 });
    expect(result.batteryV).toBe(4.03);
    expect(result.batteryPct).toBeNull();
  });

  it("85 (>6) → проценты", () => {
    const result = normalizeStreamPacket({ ...basePacket, batteryRaw: 85 });
    expect(result.batteryPct).toBe(85);
    expect(result.batteryV).toBeNull();
  });

  it("ровно 6 → вольты (граница включительно в шкалу вольт)", () => {
    const result = normalizeStreamPacket({ ...basePacket, batteryRaw: 6 });
    expect(result.batteryV).toBe(6);
    expect(result.batteryPct).toBeNull();
  });

  it("batteryRaw null → оба null", () => {
    const result = normalizeStreamPacket({ ...basePacket, batteryRaw: null });
    expect(result.batteryV).toBeNull();
    expect(result.batteryPct).toBeNull();
  });
});

describe("normalizeStreamPacket — rssi сквозняком", () => {
  it("проходит без изменений", () => {
    expect(normalizeStreamPacket({ ...basePacket, rssi: -76 }).rssi).toBe(-76);
    expect(normalizeStreamPacket({ ...basePacket, rssi: null }).rssi).toBeNull();
  });
});

describe("normalizeStreamPacket — плаузибилити-клампы", () => {
  it("SG 1.5 (после нормализации, явный hint 'sg') вне [0.980, 1.200] → null", () => {
    const result = normalizeStreamPacket({ ...basePacket, gravityRaw: 1.5, gravityUnitHint: "sg" });
    expect(result.gravitySg).toBeNull();
  });

  it("SG 0.9 вне диапазона снизу → null", () => {
    const result = normalizeStreamPacket({ ...basePacket, gravityRaw: 0.9, gravityUnitHint: "sg" });
    expect(result.gravitySg).toBeNull();
  });

  it("SG на границах диапазона [0.980, 1.200] остаётся валидным", () => {
    expect(normalizeStreamPacket({ ...basePacket, gravityRaw: 0.98, gravityUnitHint: "sg" }).gravitySg).toBe(0.98);
    expect(normalizeStreamPacket({ ...basePacket, gravityRaw: 1.2, gravityUnitHint: "sg" }).gravitySg).toBe(1.2);
  });

  it("temp 80°C вне [-10, 50] → null", () => {
    const result = normalizeStreamPacket({ ...basePacket, temperatureRaw: 80, temperatureUnitHint: "c" });
    expect(result.tempC).toBeNull();
  });

  it("temp −40°C вне [-10, 50] → null", () => {
    const result = normalizeStreamPacket({ ...basePacket, temperatureRaw: -40, temperatureUnitHint: "c" });
    expect(result.tempC).toBeNull();
  });

  it("temp на границах диапазона [-10, 50] остаётся валидным", () => {
    expect(normalizeStreamPacket({ ...basePacket, temperatureRaw: -10, temperatureUnitHint: "c" }).tempC).toBe(-10);
    expect(normalizeStreamPacket({ ...basePacket, temperatureRaw: 50, temperatureUnitHint: "c" }).tempC).toBe(50);
  });
});

describe("staleThresholdMs / isStale", () => {
  it("интервал известен: порог = 3× интервал в мс", () => {
    expect(staleThresholdMs(900)).toBe(3 * 900 * 1000);
    expect(staleThresholdMs(60)).toBe(3 * 60 * 1000);
  });

  it("интервал неизвестен (null) → 3 часа", () => {
    expect(staleThresholdMs(null)).toBe(3 * 60 * 60 * 1000);
  });

  it("интервал ≤0 трактуется как неизвестный (защита от мусора)", () => {
    expect(staleThresholdMs(0)).toBe(3 * 60 * 60 * 1000);
    expect(staleThresholdMs(-5)).toBe(3 * 60 * 60 * 1000);
  });

  it("isStale: возраст меньше порога → не устарело", () => {
    const now = new Date("2026-07-14T12:00:00Z");
    const lastSeenAt = new Date("2026-07-14T11:55:00Z"); // 5 мин назад
    expect(isStale(lastSeenAt, 900, now)).toBe(false); // порог 45 мин
  });

  it("isStale: возраст больше порога → устарело", () => {
    const now = new Date("2026-07-14T12:00:00Z");
    const lastSeenAt = new Date("2026-07-14T11:00:00Z"); // 60 мин назад
    expect(isStale(lastSeenAt, 900, now)).toBe(true); // порог 45 мин
  });

  it("isStale: lastSeenAt=null (никогда не было пакетов) → устарело", () => {
    expect(isStale(null, 900, new Date())).toBe(true);
  });
});
