import { describe, expect, it } from "vitest";

import { calculatorDefinitionBySlug, type ScalarCalculatorField } from "../features/calculators/definitions";

// К20 (аудит калькуляторов 2026-07-17): впитывание зерна и потери в котле — не одна цифра
// на все методы варки. BIAB (зерно отжимается в мешке, один сосуд) впитывает меньше и почти
// не теряет в котле; классический заторник+промывка (без отжима, два сосуда) — больше и
// того, и другого. Смена метода подставляет типичный дефолт, но не трогает поля, в которые
// пользователь уже вписал своё число.
// Ф3A-1 (ревью волны 3A): гейт по значению, а не по touched-флагу — тот не сериализуется в
// share-ссылку (serializeCalculatorStateToQuery итерирует только definition.fields), поэтому
// у получателя ссылки с вручную-правленным полем touched всегда undefined, и старый
// touched-only guard молча затирал бы его ручное число при смене метода.
describe("К20: метод-специфичные дефолты впитывания зерна и потерь в котле", () => {
  const definition = calculatorDefinitionBySlug["brewing-water-volume"];
  const methodField = definition.fields.find((field) => field.name === "methodPreset") as ScalarCalculatorField;
  const absorptionField = definition.fields.find((field) => field.name === "grainAbsorptionLPerKg") as ScalarCalculatorField;
  const kettleLossField = definition.fields.find((field) => field.name === "kettleLossL") as ScalarCalculatorField;

  it("смена метода на BIAB подставляет его типичные впитывание/потери, если поля не тронуты", () => {
    const state = { ...definition.defaults, methodPreset: "mashTunWithSparge" };
    expect(methodField.transformOnChange!("BIAB", state)).toEqual([
      ["grainAbsorptionLPerKg", 0.7],
      ["kettleLossL", 0.3]
    ]);
  });

  it("смена метода на «Система All-in-one» подставляет свой пресет", () => {
    const state = { ...definition.defaults, methodPreset: "BIAB" };
    expect(methodField.transformOnChange!("allInOne", state)).toEqual([
      ["grainAbsorptionLPerKg", 0.8],
      ["kettleLossL", 0.4]
    ]);
  });

  it("смена метода на «Экстракт» подставляет только потери в котле — впитывания зерна у экстракта нет", () => {
    const state = { ...definition.defaults, methodPreset: "mashTunWithSparge" };
    expect(methodField.transformOnChange!("extract", state)).toEqual([["kettleLossL", 0.3]]);
  });

  it("впитывание зерна НЕ подставляется, если текущее значение не совпадает ни с одним пресетом (ручной ввод) — даже без touched-флага, как у получателя share-ссылки", () => {
    const state = { ...definition.defaults, methodPreset: "mashTunWithSparge", grainAbsorptionLPerKg: 1.5 };
    expect(methodField.transformOnChange!("BIAB", state)).toEqual([["kettleLossL", 0.3]]);
  });

  it("потери в котле НЕ подставляются, если текущее значение не совпадает ни с одним пресетом (ручной ввод) — даже без touched-флага", () => {
    const state = { ...definition.defaults, methodPreset: "mashTunWithSparge", kettleLossL: 0.65 };
    expect(methodField.transformOnChange!("BIAB", state)).toEqual([["grainAbsorptionLPerKg", 0.7]]);
  });

  it("оба поля — ручной ввод, не совпадающий ни с одним пресетом — смена метода ничего не подставляет", () => {
    const state = {
      ...definition.defaults,
      methodPreset: "mashTunWithSparge",
      grainAbsorptionLPerKg: 1.5,
      kettleLossL: 0.65
    };
    expect(methodField.transformOnChange!("BIAB", state)).toEqual([]);
  });

  it("значение, равное пресету ДРУГОГО метода (не текущего) — тоже считается известным пресетом и обновляется на пресет нового", () => {
    const state = { ...definition.defaults, methodPreset: "BIAB", grainAbsorptionLPerKg: 0.8, kettleLossL: 0.4 };
    expect(methodField.transformOnChange!("mashTunWithSparge", state)).toEqual([
      ["grainAbsorptionLPerKg", 1],
      ["kettleLossL", 1]
    ]);
  });

  it("Ф3A-1: touched-флаг сам по себе больше не блокирует подстановку — решает значение поля, а не флаг", () => {
    const state = {
      ...definition.defaults,
      methodPreset: "mashTunWithSparge",
      grainAbsorptionLPerKgTouched: true,
      kettleLossLTouched: true
    };
    // grainAbsorptionLPerKg/kettleLossL здесь дефолтные для mashTunWithSparge (1/1) — оба
    // совпадают с пресетом, поэтому подстановка срабатывает несмотря на touched=true.
    expect(methodField.transformOnChange!("BIAB", state)).toEqual([
      ["grainAbsorptionLPerKg", 0.7],
      ["kettleLossL", 0.3]
    ]);
  });

  it("Ф3A-1: пустое значение поля тоже считается «не тронутым» — пресет подставляется", () => {
    const state = { ...definition.defaults, methodPreset: "mashTunWithSparge", grainAbsorptionLPerKg: "", kettleLossL: "" };
    expect(methodField.transformOnChange!("BIAB", state)).toEqual([
      ["grainAbsorptionLPerKg", 0.7],
      ["kettleLossL", 0.3]
    ]);
  });

  it("ручное редактирование «Впитывание зерна» помечает поле как touched", () => {
    expect(absorptionField.transformOnChange!("0.65", {})).toEqual([["grainAbsorptionLPerKgTouched", true]]);
  });

  it("ручное редактирование «Потери в котле» помечает поле как touched", () => {
    expect(kettleLossField.transformOnChange!("0.9", {})).toEqual([["kettleLossLTouched", true]]);
  });

  describe("migrateStoredState", () => {
    it("легаси плоский дефолт (0.8/0.5) без touched — переносится на пресет сохранённого метода (BIAB)", () => {
      const migrated = definition.migrateStoredState!({
        methodPreset: "BIAB",
        grainAbsorptionLPerKg: 0.8,
        kettleLossL: 0.5
      });
      expect(migrated.grainAbsorptionLPerKg).toBe(0.7);
      expect(migrated.kettleLossL).toBe(0.3);
    });

    it("легаси плоский дефолт при методе «Заторник + промывка» — тоже обновляется (1/1)", () => {
      const migrated = definition.migrateStoredState!({
        methodPreset: "mashTunWithSparge",
        grainAbsorptionLPerKg: 0.8,
        kettleLossL: 0.5
      });
      expect(migrated.grainAbsorptionLPerKg).toBe(1);
      expect(migrated.kettleLossL).toBe(1);
    });

    it("не легаси-значение — считается ручным вводом, не трогается, но помечается touched", () => {
      const stored = { methodPreset: "BIAB", grainAbsorptionLPerKg: 1.2, kettleLossL: 0.9 };
      const migrated = definition.migrateStoredState!(stored);
      expect(migrated.grainAbsorptionLPerKg).toBe(1.2);
      expect(migrated.kettleLossL).toBe(0.9);
      expect(migrated.grainAbsorptionLPerKgTouched).toBe(true);
      expect(migrated.kettleLossLTouched).toBe(true);
    });

    it("значение строкой (ручной ввод до touched-флага) — помечается touched, само значение не трогается", () => {
      const migrated = definition.migrateStoredState!({
        methodPreset: "BIAB",
        grainAbsorptionLPerKg: "0.8",
        kettleLossL: "0.5"
      });
      expect(migrated.grainAbsorptionLPerKg).toBe("0.8");
      expect(migrated.kettleLossL).toBe("0.5");
      expect(migrated.grainAbsorptionLPerKgTouched).toBe(true);
      expect(migrated.kettleLossLTouched).toBe(true);
    });

    it("уже помеченное touched — не переписывается легаси-значением", () => {
      const stored = { methodPreset: "BIAB", grainAbsorptionLPerKg: 0.8, grainAbsorptionLPerKgTouched: true };
      expect(definition.migrateStoredState!(stored)).toEqual(stored);
    });
  });

  it("приёмка: BIAB и классический заторник с пустым «Впитывание зерна» дают разный итог воды (метод-специфичный фолбэк)", () => {
    const biab = definition.calculate({ ...definition.defaults, methodPreset: "BIAB", grainAbsorptionLPerKg: "" });
    const classic = definition.calculate({ ...definition.defaults, methodPreset: "mashTunWithSparge", grainAbsorptionLPerKg: "" });

    const biabTotal = Number.parseFloat(biab.primary.value);
    const classicTotal = Number.parseFloat(classic.primary.value);
    // BIAB впитывает меньше (0.7 л/кг) классического заторника (1.0 л/кг) — при том же
    // зерне и целевом объёме суммарная вода у BIAB ниже.
    expect(biabTotal).toBeLessThan(classicTotal);
  });
});
