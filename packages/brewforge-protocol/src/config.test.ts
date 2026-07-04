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

// Точный ferment{}/distill{} JSON, который прошивка отдаёт под "config" (v9/v7-8,
// bf_config_to_cjson) + appMode (v11). steps — ВСЕГДА BF_MAX_FERMENT_STEPS=6 элементов
// (прошивка сериализует весь массив независимо от nSteps).
const fermentConfig = {
  hysteresisC: 0.5,
  compMinOffS: 180,
  compMinOnS: 120,
  heatEnabled: true,
  nSteps: 3,
  steps: [
    { tempC: 20, hours: 168 },
    { tempC: 21, hours: 48 },
    { tempC: 3, hours: 0 },
    { tempC: 18, hours: 0 },
    { tempC: 18, hours: 0 },
    { tempC: 18, hours: 0 },
  ],
};

const distillConfig = {
  headsPct: 40,
  heartsPct: 70,
  tailsPct: 50,
  tHeadsC: 60,
  tHeartsC: 78,
  tTailsC: 82,
  tEndC: 96,
  headsReflux: 6,
  heartsReflux: 3,
  tailsReflux: 2,
  refluxWindowS: 30,
};

describe("DeviceConfigSchema — ferment/distill/appMode (§13)", () => {
  it("round-trip'ит конфиг с ferment{}/distill{}/appMode без потерь", () => {
    const withModes = { ...firmwareConfig, ferment: fermentConfig, distill: distillConfig, appMode: 2 };
    const parsed = DeviceConfigSchema.parse(withModes);
    expect(parsed).toEqual(withModes);
    expect(parsed.ferment?.steps).toHaveLength(6);
    expect(parsed.appMode).toBe(2);
  });

  it("конфиг БЕЗ ferment/distill/appMode всё ещё валиден (старая прошивка)", () => {
    const parsed = DeviceConfigSchema.parse(firmwareConfig);
    expect(parsed.ferment).toBeUndefined();
    expect(parsed.distill).toBeUndefined();
    expect(parsed.appMode).toBeUndefined();
  });

  it("отклоняет ferment.steps длиннее 6 ступеней", () => {
    const tooMany = {
      ...firmwareConfig,
      ferment: { ...fermentConfig, steps: [...fermentConfig.steps, { tempC: 18, hours: 0 }] },
    };
    expect(DeviceConfigSchema.safeParse(tooMany).success).toBe(false);
  });

  it("применяет клампы (min/max) полей ferment/distill/appMode", () => {
    // ferment: гистерезис вне [0.1, 5], nSteps вне [1, 6], ступень tempC вне [-2, 40]
    expect(
      DeviceConfigSchema.safeParse({ ...firmwareConfig, ferment: { ...fermentConfig, hysteresisC: 10 } }).success,
    ).toBe(false);
    expect(
      DeviceConfigSchema.safeParse({ ...firmwareConfig, ferment: { ...fermentConfig, nSteps: 0 } }).success,
    ).toBe(false);
    expect(
      DeviceConfigSchema.safeParse({ ...firmwareConfig, ferment: { ...fermentConfig, nSteps: 7 } }).success,
    ).toBe(false);
    expect(
      DeviceConfigSchema.safeParse({
        ...firmwareConfig,
        ferment: { ...fermentConfig, steps: [{ tempC: 41, hours: 0 }, ...fermentConfig.steps.slice(1)] },
      }).success,
    ).toBe(false);

    // distill: пороги вне [30, 110], проценты вне [0, 100]
    expect(
      DeviceConfigSchema.safeParse({ ...firmwareConfig, distill: { ...distillConfig, tHeadsC: 200 } }).success,
    ).toBe(false);
    expect(
      DeviceConfigSchema.safeParse({ ...firmwareConfig, distill: { ...distillConfig, headsPct: 150 } }).success,
    ).toBe(false);

    // appMode: bf_app_mode_t только {0,1,2}
    expect(DeviceConfigSchema.safeParse({ ...firmwareConfig, appMode: 3 }).success).toBe(false);
    expect(DeviceConfigSchema.safeParse({ ...firmwareConfig, appMode: -1 }).success).toBe(false);
    expect(DeviceConfigSchema.safeParse({ ...firmwareConfig, appMode: 0 }).success).toBe(true);
  });
});

describe("DeviceConfigPatchSchema — ferment/distill/appMode", () => {
  it("принимает частичный ferment-патч (одна ступень/одно поле контура)", () => {
    expect(DeviceConfigPatchSchema.safeParse({ ferment: { hysteresisC: 1 } }).success).toBe(true);
    expect(
      DeviceConfigPatchSchema.safeParse({ ferment: { steps: [{ tempC: 19 }] } }).success,
    ).toBe(true);
    expect(DeviceConfigPatchSchema.safeParse({ distill: { tHeadsC: 62 } }).success).toBe(true);
    expect(DeviceConfigPatchSchema.safeParse({ appMode: 1 }).success).toBe(true);
  });

  it("всё ещё отклоняет патч со ступенями сверх 6 или вне диапазона", () => {
    expect(
      DeviceConfigPatchSchema.safeParse({
        ferment: { steps: Array.from({ length: 7 }, () => ({ tempC: 18 })) },
      }).success,
    ).toBe(false);
    expect(DeviceConfigPatchSchema.safeParse({ appMode: 5 }).success).toBe(false);
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
