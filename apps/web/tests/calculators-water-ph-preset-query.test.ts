import { describe, expect, it } from "vitest";

import { calculatorDefinitionBySlug, initialCalculatorStateFromQuery } from "../features/calculators/definitions";

// Ф2-1 (ревью волны 2 калькуляторов): migrateStoredState water-ph сверяет 6 ионов
// (sourceCa..sourceHco3) с каталогом пресетов SOURCE_WATER_CALC_PRESETS и проставляет
// sourceWaterPreset — но раньше только при гидратации из localStorage. Входящая share-ссылка
// идёт через initialCalculatorStateFromQuery (applyQuery), которая migrateStoredState не
// вызывает: старая ссылка несёт ионы (например все 0 = осмос), но не несёт sourceWaterPreset —
// чип оставался дефолтным "soft", хотя вода фактически другая. Сверка вынесена в чистую
// resolveSourceWaterPresetFromIons и теперь вызывается и из applyQuery — при условии, что
// сама ссылка не несёт sourceWaterPreset явно (иначе её выбор уважается как есть).
describe("Ф2-1: честная подпись чипа пресета исходной воды для входящих ссылок", () => {
  const definition = calculatorDefinitionBySlug["water-ph"];

  it("share-ссылка с ионами осмоса (все 0) без sourceWaterPreset → чип 'ro'", () => {
    const restored = initialCalculatorStateFromQuery(definition, {
      sourceCa: "0",
      sourceMg: "0",
      sourceNa: "0",
      sourceCl: "0",
      sourceSo4: "0",
      sourceHco3: "0"
    });

    expect(restored.sourceWaterPreset).toBe("ro");
  });

  it("share-ссылка с ионами «мягкой» воды без sourceWaterPreset → чип 'soft'", () => {
    const restored = initialCalculatorStateFromQuery(definition, {
      sourceCa: "35",
      sourceMg: "8",
      sourceNa: "12",
      sourceCl: "35",
      sourceSo4: "55",
      sourceHco3: "90"
    });

    expect(restored.sourceWaterPreset).toBe("soft");
  });

  it("share-ссылка с кастомными ионами без sourceWaterPreset → чип 'custom'", () => {
    const restored = initialCalculatorStateFromQuery(definition, {
      sourceCa: "60",
      sourceMg: "8",
      sourceNa: "12",
      sourceCl: "35",
      sourceSo4: "55",
      sourceHco3: "90"
    });

    expect(restored.sourceWaterPreset).toBe("custom");
  });

  it("ссылка, явно несущая sourceWaterPreset, — уважается как есть (ионы не пересчитывают чип)", () => {
    // Ионы в query совпадают с "soft" один в один, но сама ссылка явно просит "custom" —
    // это не должно быть молча переписано обратно в "soft" по совпадению ионов.
    const restored = initialCalculatorStateFromQuery(definition, {
      sourceWaterPreset: "custom",
      sourceCa: "35",
      sourceMg: "8",
      sourceNa: "12",
      sourceCl: "35",
      sourceSo4: "55",
      sourceHco3: "90"
    });

    expect(restored.sourceWaterPreset).toBe("custom");
  });

  // Регрессия рефакторинга: migrateStoredState (старый localStorage без ключа) продолжает
  // работать через ту же общую resolveSourceWaterPresetFromIons.
  it("migrateStoredState: старый localStorage с ионами осмоса без ключа → 'ro'", () => {
    const stored = {
      sourceCa: 0,
      sourceMg: 0,
      sourceNa: 0,
      sourceCl: 0,
      sourceSo4: 0,
      sourceHco3: 0
    };

    expect(definition.migrateStoredState!(stored).sourceWaterPreset).toBe("ro");
  });

  it("migrateStoredState: sourceWaterPreset уже задан — не трогаем", () => {
    const stored = { sourceWaterPreset: "custom", sourceCa: 35, sourceMg: 8, sourceNa: 12, sourceCl: 35, sourceSo4: 55, sourceHco3: 90 };

    expect(definition.migrateStoredState!(stored)).toEqual(stored);
  });
});
