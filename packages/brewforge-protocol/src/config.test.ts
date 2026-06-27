import { describe, expect, it } from "vitest";

import {
  CONFIG_FIELD_RANGES,
  DeviceConfigPatchSchema,
  DeviceConfigSchema,
} from "./config";

// Точный объект, который прошивка отдаёт под ключом "config" (bf_config_to_cjson).
// units — ЧИСЛО (bf_units_t: 0=C), sensorCal — массив из BF_MAX_SENSORS=5 элементов.
const firmwareConfig = {
  units: 0,
  pid: { kp: 100, ki: 0.4, kd: 100, sampleMs: 3000, windowMs: 5000, pidStartBandC: 2, ponMeasurement: false },
  pump: { cycleMin: 10, restMin: 1, stopTempC: 92, primeCycles: 2, paddleMode: false, heatDuringRest: false },
  boil: { tempC: 100, heatPct: 70 },
  safety: { overshootCutC: 5, absMaxC: 105, maxDtPerSec: 2, sensorFaultCycles: 3, stageTimeoutMin: 120 },
  filterBeta: 1.0,
  interHeaterDelayMs: 10,
  buzzer: true,
  spargeHeating: false,
  iodineTest: true,
  removeMaltPrompt: true,
  sensorCal: [
    { scale: 1, offset: 0 },
    { scale: 1, offset: 0 },
    { scale: 1, offset: 0 },
    { scale: 1, offset: 0 },
    { scale: 1, offset: 0 },
  ],
};

describe("DeviceConfigSchema", () => {
  it("разбирает точный JSON прошивки и round-trip'ит без потерь", () => {
    const parsed = DeviceConfigSchema.parse(firmwareConfig);
    expect(parsed).toEqual(firmwareConfig);
    expect(parsed.units).toBe(0);
    expect(parsed.pid.kp).toBe(100);
    expect(parsed.sensorCal).toHaveLength(5);
  });

  it("принимает units=1 (°F) и отклоняет иные значения единиц", () => {
    expect(DeviceConfigSchema.safeParse({ ...firmwareConfig, units: 1 }).success).toBe(true);
    expect(DeviceConfigSchema.safeParse({ ...firmwareConfig, units: 2 }).success).toBe(false);
  });

  it("passthrough: сохраняет неизвестные поля (forward-compat) на корне и во вложенных", () => {
    const parsed = DeviceConfigSchema.parse({
      ...firmwareConfig,
      futureRootField: 42,
      pid: { ...firmwareConfig.pid, futurePidField: "x" },
    });
    expect((parsed as Record<string, unknown>).futureRootField).toBe(42);
    expect((parsed.pid as Record<string, unknown>).futurePidField).toBe("x");
  });

  it("отклоняет грубо неверный тип известного поля", () => {
    expect(
      DeviceConfigSchema.safeParse({ ...firmwareConfig, pid: { ...firmwareConfig.pid, kp: "nope" } }).success,
    ).toBe(false);
  });
});

describe("DeviceConfigPatchSchema", () => {
  it("принимает частичный патч на любом уровне вложенности", () => {
    expect(DeviceConfigPatchSchema.safeParse({}).success).toBe(true);
    expect(DeviceConfigPatchSchema.safeParse({ pid: { kp: 120 } }).success).toBe(true);
    expect(DeviceConfigPatchSchema.safeParse({ boil: { tempC: 99 } }).success).toBe(true);
    expect(DeviceConfigPatchSchema.safeParse({ buzzer: false }).success).toBe(true);
    // полный конфиг прошивки тоже валиден как «патч»
    expect(DeviceConfigPatchSchema.safeParse(firmwareConfig).success).toBe(true);
  });

  it("всё ещё проверяет типы присутствующих полей", () => {
    expect(DeviceConfigPatchSchema.safeParse({ pid: { kp: "x" } }).success).toBe(false);
    expect(DeviceConfigPatchSchema.safeParse({ buzzer: 1 }).success).toBe(false);
  });
});

describe("CONFIG_FIELD_RANGES", () => {
  it("несёт корректные диапазоны для числовых полей и опции для enum/bool", () => {
    const sample = CONFIG_FIELD_RANGES["pid.sampleMs"];
    expect(sample.kind).toBe("number");
    if (sample.kind === "number") {
      expect(sample.min).toBeLessThan(sample.max);
      expect(sample.unit).toBe("мс");
    }
    expect(CONFIG_FIELD_RANGES.units.kind).toBe("enum");
    expect(CONFIG_FIELD_RANGES.buzzer.kind).toBe("bool");

    // у каждого числового дескриптора min < max и положительный шаг
    for (const desc of Object.values(CONFIG_FIELD_RANGES)) {
      if (desc.kind === "number") {
        expect(desc.min).toBeLessThan(desc.max);
        expect(desc.step).toBeGreaterThan(0);
      }
    }
  });
});
