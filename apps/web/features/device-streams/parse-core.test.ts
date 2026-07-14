import { describe, expect, it } from "vitest";

import { parseStreamPacket } from "./parse-core";

// =============================================================================
//  Юнит-тесты parseStreamPacket — автодетект+парс трёх пуш-форматов (§8.2).
//  Эталонные пакеты — из docs/specs/third-party-fermentation-devices.md §8.2.
// =============================================================================

describe("parseStreamPacket — iSpindel native", () => {
  it("парсит эталонный пакет iSpindel", () => {
    const result = parseStreamPacket({
      name: "iSpindel000",
      ID: 4974097,
      angle: 83.49,
      temperature: 21.44,
      temp_units: "C",
      battery: 4.03,
      gravity: 30.29,
      interval: 900,
      RSSI: -76
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.packet).toEqual({
      format: "ispindel",
      name: "iSpindel000",
      gravityRaw: 30.29,
      gravityUnitHint: null,
      temperatureRaw: 21.44,
      temperatureUnitHint: "c",
      pressureRaw: null,
      pressureUnitHint: null,
      batteryRaw: 4.03,
      rssi: -76,
      intervalSeconds: 900,
      sourceTs: null
    });
  });

  it("GravityMon: 'gravity-unit':'P' (дефис в ключе) читается как plato-hint", () => {
    const result = parseStreamPacket({
      name: "GravityMon",
      angle: 80.1,
      temperature: 20.5,
      temp_units: "F",
      battery: 3.95,
      gravity: 12.4,
      "gravity-unit": "P",
      interval: 600,
      RSSI: -60
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.packet.format).toBe("ispindel");
    expect(result.packet.gravityUnitHint).toBe("plato");
    expect(result.packet.temperatureUnitHint).toBe("f");
  });

  it("GravityMon: 'gravity-unit':'G' читается как sg-hint", () => {
    const result = parseStreamPacket({ angle: 80, temperature: 20, gravity: 1.05, "gravity-unit": "G" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.packet.gravityUnitHint).toBe("sg");
  });

  it("терпимо читает числовые строки", () => {
    const result = parseStreamPacket({
      name: "iSpindel000",
      angle: "83.49",
      temperature: "21.44",
      battery: "4.03",
      gravity: "30.29",
      interval: "900",
      RSSI: "-76"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.packet.gravityRaw).toBe(30.29);
    expect(result.packet.temperatureRaw).toBe(21.44);
    expect(result.packet.batteryRaw).toBe(4.03);
    expect(result.packet.intervalSeconds).toBe(900);
    expect(result.packet.rssi).toBe(-76);
  });

  it("мусор в числовых полях → null, не падает", () => {
    const result = parseStreamPacket({ angle: 80, temperature: 20, gravity: "не число", battery: undefined });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.packet.gravityRaw).toBeNull();
    expect(result.packet.batteryRaw).toBeNull();
  });

  it("отсутствующие опциональные поля → null, формат всё равно распознан", () => {
    const result = parseStreamPacket({ angle: 80, temperature: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.packet).toMatchObject({
      format: "ispindel",
      name: null,
      gravityRaw: null,
      batteryRaw: null,
      rssi: null,
      intervalSeconds: null
    });
  });
});

describe("parseStreamPacket — Brewfather custom stream", () => {
  it("парсит эталонный пакет Floaty", () => {
    const result = parseStreamPacket({
      name: "Floaty01",
      temp: 19.2,
      temp_unit: "C",
      gravity: 1.048,
      gravity_unit: "G",
      pressure: 0,
      pressure_unit: "PSI",
      ph: 0,
      battery: 3.9
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.packet).toEqual({
      format: "brewfather",
      name: "Floaty01",
      gravityRaw: 1.048,
      gravityUnitHint: "sg",
      temperatureRaw: 19.2,
      temperatureUnitHint: "c",
      pressureRaw: 0,
      pressureUnitHint: "psi",
      batteryRaw: 3.9,
      rssi: null,
      intervalSeconds: null,
      sourceTs: null
    });
  });

  it("распознаётся и без gravity, только по temp", () => {
    const result = parseStreamPacket({ name: "BrewPiLess", temp: 18.5, temp_unit: "C" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.packet.format).toBe("brewfather");
    expect(result.packet.gravityRaw).toBeNull();
  });

  it("распознаётся и без temp, только по gravity", () => {
    const result = parseStreamPacket({ name: "Floaty01", gravity: 12.4, gravity_unit: "P" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.packet.format).toBe("brewfather");
    expect(result.packet.gravityUnitHint).toBe("plato");
  });
});

describe("parseStreamPacket — Tilt cloud logging", () => {
  it("парсит эталонный пакет Tilt", () => {
    const result = parseStreamPacket({
      Timepoint: 45123.52,
      Temp: 68.5,
      SG: 1.048,
      Beer: "Untitled",
      Color: "BLACK",
      Comment: ""
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.packet.format).toBe("tilt");
    expect(result.packet.name).toBe("BLACK");
    expect(result.packet.gravityRaw).toBe(1.048);
    expect(result.packet.gravityUnitHint).toBe("sg");
    expect(result.packet.temperatureRaw).toBe(68.5);
    expect(result.packet.temperatureUnitHint).toBe("f");
    expect(result.packet.pressureRaw).toBeNull();
    expect(result.packet.batteryRaw).toBeNull();

    // Excel-серийная дата 45123.52 → середина 2023 года (разумный диапазон).
    expect(result.packet.sourceTs).not.toBeNull();
    const year = result.packet.sourceTs?.getUTCFullYear();
    expect(year).toBe(2023);
  });

  it("невалидный/отсутствующий Timepoint → sourceTs null", () => {
    const missing = parseStreamPacket({ Temp: 68.5, SG: 1.048 });
    expect(missing.ok).toBe(true);
    if (missing.ok) expect(missing.packet.sourceTs).toBeNull();

    const garbage = parseStreamPacket({ Temp: 68.5, SG: 1.048, Timepoint: "не дата" });
    expect(garbage.ok).toBe(true);
    if (garbage.ok) expect(garbage.packet.sourceTs).toBeNull();
  });
});

describe("parseStreamPacket — битые тела и неизвестный формат", () => {
  it("null → invalid_body", () => {
    expect(parseStreamPacket(null)).toEqual({ ok: false, error: "invalid_body" });
  });

  it("массив → invalid_body", () => {
    expect(parseStreamPacket([1, 2, 3])).toEqual({ ok: false, error: "invalid_body" });
  });

  it("строка → invalid_body", () => {
    expect(parseStreamPacket("не json-объект")).toEqual({ ok: false, error: "invalid_body" });
  });

  it("число → invalid_body", () => {
    expect(parseStreamPacket(42)).toEqual({ ok: false, error: "invalid_body" });
  });

  it("undefined → invalid_body", () => {
    expect(parseStreamPacket(undefined)).toEqual({ ok: false, error: "invalid_body" });
  });

  it("пустой объект → unknown_format (валидный объект, но ни один признак не совпал)", () => {
    expect(parseStreamPacket({})).toEqual({ ok: false, error: "unknown_format" });
  });

  it("объект с не относящимися к делу полями → unknown_format", () => {
    expect(parseStreamPacket({ foo: "bar", baz: 42 })).toEqual({ ok: false, error: "unknown_format" });
  });
});
