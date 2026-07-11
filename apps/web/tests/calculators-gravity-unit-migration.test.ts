import { describe, expect, it } from "vitest";

import { calculatorDefinitionBySlug } from "../features/calculators/definitions";

// Основная шкала плотности по умолчанию сменилась SG → Plato (решение владельца,
// 2026-07-10) для abv-attenuation/dilution-boiloff/hydrometer-correction/ibu/
// yeast-starter/speise-krausen/brewhouse-efficiency/unit-converter. Состояния,
// сохранённые в localStorage ДО этого изменения (или до появления самого ключа
// единицы), хранят значения плотности в SG без явного ключа шкалы — merge с новыми
// дефолтами без миграции проставил бы Plato поверх старого SG-числа (1.050 читалось
// бы как 12.4 °P... точнее, как 1.05 °P — на порядок хуже). migrateStoredState
// должен проставлять "SG" в этом случае, ничего не пересчитывая (значение — то же
// число, только явно помечено прежней шкалой).
describe("миграция дефолтной шкалы плотности SG → Plato: старые localStorage-состояния без ключа шкалы остаются в SG", () => {
  it("abv-attenuation: og/fg без gravityUnit → шкала SG", () => {
    const definition = calculatorDefinitionBySlug["abv-attenuation"];
    const stored = { og: 1.05, fg: 1.012 };

    const migrated = definition.migrateStoredState!(stored);

    expect(migrated.gravityUnit).toBe("SG");
    expect(migrated.og).toBe(1.05);
    expect(migrated.fg).toBe(1.012);
  });

  it("abv-attenuation: gravityUnit уже задан — не трогаем", () => {
    const definition = calculatorDefinitionBySlug["abv-attenuation"];
    const stored = { og: 12.4, fg: 3.1, gravityUnit: "Plato" };

    expect(definition.migrateStoredState!(stored)).toEqual(stored);
  });

  it("abv-attenuation: пустое состояние (нет og/fg) — не проставляем шкалу", () => {
    const definition = calculatorDefinitionBySlug["abv-attenuation"];
    const stored = { abvFormula: "alternate" };

    expect(definition.migrateStoredState!(stored)).toEqual(stored);
  });

  it("dilution-boiloff: currentGravity/targetGravity без gravityUnit → шкала SG, старая миграция additionType не ломается", () => {
    const definition = calculatorDefinitionBySlug["dilution-boiloff"];
    const stored = { currentGravity: 1.06, targetGravity: 1.05, additionType: "water" };

    const migrated = definition.migrateStoredState!(stored);

    expect(migrated.gravityUnit).toBe("SG");
    expect(migrated.currentGravity).toBe(1.06);
    expect(migrated.targetGravity).toBe(1.05);
    expect(migrated.additionType).toBe("dme");
  });

  it("hydrometer-correction: reading без readingUnit → шкала SG", () => {
    const definition = calculatorDefinitionBySlug["hydrometer-correction"];
    const stored = { reading: 1.05 };

    const migrated = definition.migrateStoredState!(stored);

    expect(migrated.readingUnit).toBe("SG");
    expect(migrated.reading).toBe(1.05);
  });

  // Поправка прибора раньше хранилась всегда в SG (ключ instrumentOffset), теперь — в шкале
  // показания (ключ offset). Конверсия дельты якорится на воде: 0.002 SG в дистилляте ≈ 0.51 °P.
  describe("hydrometer-correction: миграция instrumentOffset (SG) → offset в шкале показания", () => {
    const definition = calculatorDefinitionBySlug["hydrometer-correction"];

    it("шкала SG: число то же, старый ключ выброшен", () => {
      const migrated = definition.migrateStoredState!({ reading: 1.05, readingUnit: "SG", instrumentOffset: 0.002 });

      expect(migrated.instrumentOffset).toBeUndefined();
      expect(Number(migrated.offset)).toBeCloseTo(0.002, 5);
    });

    it("шкала Plato: SG-дельта конвертируется с якорем на воде", () => {
      const migrated = definition.migrateStoredState!({ reading: 12.4, readingUnit: "Plato", instrumentOffset: 0.002 });

      expect(migrated.instrumentOffset).toBeUndefined();
      expect(Number(migrated.offset)).toBeCloseTo(0.51, 1);
    });

    it("совсем старое состояние без readingUnit: шкала → SG, офсет остаётся SG-числом", () => {
      const migrated = definition.migrateStoredState!({ reading: 1.05, instrumentOffset: -0.001 });

      expect(migrated.readingUnit).toBe("SG");
      expect(Number(migrated.offset)).toBeCloseTo(-0.001, 5);
    });

    it("новая форма (offset уже есть) — не трогаем", () => {
      const stored = { reading: 12.4, readingUnit: "Plato", offset: 0.5 };

      expect(definition.migrateStoredState!(stored)).toEqual(stored);
    });
  });

  it("ibu: wortGravity без gravityUnit → шкала SG", () => {
    const definition = calculatorDefinitionBySlug.ibu;
    const stored = { wortGravity: 1.05, boilTimeMinutes: 90 };

    const migrated = definition.migrateStoredState!(stored);

    expect(migrated.gravityUnit).toBe("SG");
    expect(migrated.wortGravity).toBe(1.05);
  });

  it("yeast-starter: gravity без gravityUnit → шкала SG", () => {
    const definition = calculatorDefinitionBySlug["yeast-starter"];
    const stored = { gravity: 1.05, wortVolumeL: 20 };

    const migrated = definition.migrateStoredState!(stored);

    expect(migrated.gravityUnit).toBe("SG");
    expect(migrated.gravity).toBe(1.05);
  });

  it("brewhouse-efficiency: measuredOg без gravityUnit → шкала SG", () => {
    const definition = calculatorDefinitionBySlug["brewhouse-efficiency"];
    const stored = { measuredOg: 1.05, mode: "measure" };

    const migrated = definition.migrateStoredState!(stored);

    expect(migrated.gravityUnit).toBe("SG");
    expect(migrated.measuredOg).toBe(1.05);
  });

  it("speise-krausen: speiseGravity без gravityUnit → шкала SG, старая миграция mode=gyle не ломается", () => {
    const definition = calculatorDefinitionBySlug["speise-krausen"];
    const stored = { speiseGravity: 1.05, mode: "gyle" };

    const migrated = definition.migrateStoredState!(stored);

    expect(migrated.gravityUnit).toBe("SG");
    expect(migrated.speiseGravity).toBe(1.05);
    expect(migrated.mode).toBe("speise");
  });

  it("unit-converter: gravityValue без gravityFrom → шкала SG", () => {
    const definition = calculatorDefinitionBySlug["unit-converter"];
    const stored = { gravityValue: "1.05" };

    const migrated = definition.migrateStoredState!(stored);

    expect(migrated.gravityFrom).toBe("SG");
    expect(migrated.gravityValue).toBe("1.05");
  });

  it("unit-converter: gravityFrom уже задан — не трогаем", () => {
    const definition = calculatorDefinitionBySlug["unit-converter"];
    const stored = { gravityValue: "12.4", gravityFrom: "Plato" };

    expect(definition.migrateStoredState!(stored)).toEqual(stored);
  });
});

describe("дефолты калькуляторов плотности — основная шкала Plato", () => {
  const platoDefaultSlugs = [
    "abv-attenuation",
    "dilution-boiloff",
    "hydrometer-correction",
    "ibu",
    "yeast-starter",
    "speise-krausen",
    "brewhouse-efficiency"
  ] as const;

  it.each(platoDefaultSlugs)("%s: gravityUnit/readingUnit по умолчанию — Plato", (slug) => {
    const definition = calculatorDefinitionBySlug[slug];
    const unitField = slug === "hydrometer-correction" ? "readingUnit" : "gravityUnit";

    expect(definition.defaults[unitField]).toBe("Plato");
  });

  it("unit-converter: gravityFrom по умолчанию — Plato", () => {
    const definition = calculatorDefinitionBySlug["unit-converter"];

    expect(definition.defaults.gravityFrom).toBe("Plato");
  });

  it("refractometer-correction: originalUnit остаётся Brix (рефрактометр Plato не меряет)", () => {
    const definition = calculatorDefinitionBySlug["refractometer-correction"];

    expect(definition.defaults.originalUnit).toBe("Brix");
  });
});

// Строки "Засыпи" раньше выбирались из пресетного select "Тип" (FERMENTABLE_PPG_PRESETS),
// теперь — из каталога ингредиентов через IngredientPicker: {name, weightKg, ppg, mashed}
// вместо {weightKg, type, ppg}. migrateStoredState переносит старые сохранённые строки.
describe("brewhouse-efficiency: миграция строк засыпи из старого пресетного формата (до IngredientPicker)", () => {
  it("непустой preset-тип → name/ppg/mashed из бывших FERMENTABLE_PPG_PRESETS", () => {
    const definition = calculatorDefinitionBySlug["brewhouse-efficiency"];
    const stored = {
      fermentables: [
        { weightKg: 4.5, type: "base_malt", ppg: "" },
        { weightKg: 0.3, type: "crystal", ppg: "" },
        { weightKg: 0.2, type: "honey", ppg: "" }
      ]
    };

    const migrated = definition.migrateStoredState!(stored);

    expect(migrated.fermentables).toEqual([
      { name: "Базовый солод", weightKg: 4.5, ppg: 37, mashed: "1" },
      { name: "Карамельный", weightKg: 0.3, ppg: 34, mashed: "1" },
      { name: "Мёд", weightKg: 0.2, ppg: 35, mashed: "0" }
    ]);
  });

  it("type: custom → name «Другое (свой PPG)», ppg — введённое пользователем значение, mashed «1»", () => {
    const definition = calculatorDefinitionBySlug["brewhouse-efficiency"];
    const stored = {
      fermentables: [{ weightKg: 5, type: "custom", ppg: "42.5" }]
    };

    const migrated = definition.migrateStoredState!(stored);

    expect(migrated.fermentables).toEqual([
      { name: "Другое (свой PPG)", weightKg: 5, ppg: "42.5", mashed: "1" }
    ]);
  });

  it("новая форма строки (нет поля type) остаётся без изменений", () => {
    const definition = calculatorDefinitionBySlug["brewhouse-efficiency"];
    const stored = {
      fermentables: [{ name: "Pilsner", weightKg: 4, ppg: 37, mashed: "1" }]
    };

    expect(definition.migrateStoredState!(stored)).toEqual(stored);
  });

  it("сочетается с миграцией шкалы: measuredOg без gravityUnit и старые строки засыпи мигрируют вместе", () => {
    const definition = calculatorDefinitionBySlug["brewhouse-efficiency"];
    const stored = {
      measuredOg: 1.05,
      fermentables: [{ weightKg: 4.5, type: "base_malt", ppg: "" }]
    };

    const migrated = definition.migrateStoredState!(stored);

    expect(migrated.gravityUnit).toBe("SG");
    expect(migrated.fermentables).toEqual([
      { name: "Базовый солод", weightKg: 4.5, ppg: 37, mashed: "1" }
    ]);
  });
});
