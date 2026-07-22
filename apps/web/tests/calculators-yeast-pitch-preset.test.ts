import { describe, expect, it } from "vitest";

import { calculatorDefinitionBySlug, type ScalarCalculatorField } from "../features/calculators/definitions";

// К3 (аудит калькуляторов 2026-07-17): cellsPerPackBillion был плоским 100 независимо от
// типа дрожжей — у сухого пакета (11 г ≈ 200 млрд) это давало ложный "недосев" вдвое.
// Смена "Тип дрожжей" теперь подставляет пресет (жидкие ~100, сухие ~200), но только если
// пользователь не редактировал "Клеток в пакете" руками (cellsPerPackBillionTouched).
describe("К3: пресет клеток в пакете дрожжей по типу", () => {
  const definition = calculatorDefinitionBySlug["yeast-starter"];
  const yeastTypeField = definition.fields.find((field) => field.name === "yeastType") as ScalarCalculatorField;
  const cellsField = definition.fields.find((field) => field.name === "cellsPerPackBillion") as ScalarCalculatorField;

  it("смена типа на «Сухие» подставляет пресет 200 млрд, если поле не тронуто", () => {
    const state = { ...definition.defaults, yeastType: "liquid", cellsPerPackBillion: 100 };
    expect(yeastTypeField.transformOnChange!("dry", state)).toEqual([["cellsPerPackBillion", 200]]);
  });

  it("смена типа на «Жидкие» подставляет пресет 100 млрд, если поле не тронуто", () => {
    const state = { ...definition.defaults, yeastType: "dry", cellsPerPackBillion: 200 };
    expect(yeastTypeField.transformOnChange!("liquid", state)).toEqual([["cellsPerPackBillion", 100]]);
  });

  it("пресет НЕ подставляется, если пользователь уже вручную менял «Клеток в пакете»", () => {
    const state = {
      ...definition.defaults,
      yeastType: "liquid",
      cellsPerPackBillion: 150,
      cellsPerPackBillionTouched: true
    };
    expect(yeastTypeField.transformOnChange!("dry", state)).toEqual([]);
  });

  it("ручное редактирование «Клеток в пакете» помечает поле как touched", () => {
    expect(cellsField.transformOnChange!("150", {})).toEqual([["cellsPerPackBillionTouched", true]]);
  });

  it("migrateStoredState переносит старый плоский дефолт 100 на 200 для «Сухих», если поле не тронуто", () => {
    const migrated = definition.migrateStoredState!({ yeastType: "dry", cellsPerPackBillion: 100 });
    expect(migrated.cellsPerPackBillion).toBe(200);
  });

  it("migrateStoredState не трогает значение, если пользователь уже вписал своё число руками", () => {
    const stored = { yeastType: "dry", cellsPerPackBillion: 100, cellsPerPackBillionTouched: true };
    expect(definition.migrateStoredState!(stored)).toEqual(stored);
  });

  it("migrateStoredState не трогает жидкие дрожжи (пресет уже верный)", () => {
    const stored = { yeastType: "liquid", cellsPerPackBillion: 100 };
    expect(definition.migrateStoredState!(stored)).toEqual(stored);
  });

  it("приёмка: «Сухие, 1 пачка, 20 л, 12.4 °P» с верным пресетом (200) не показывает недосев", () => {
    const withFixedPreset = definition.calculate({
      ...definition.defaults,
      yeastType: "dry",
      cellsPerPackBillion: 200,
      packsCount: 1,
      wortVolumeL: 20,
      gravity: 12.4,
      gravityUnit: "Plato"
    });

    expect(withFixedPreset.primary.tone).toBe("good");
  });

  it("контраст: тот же сценарий со старым плоским дефолтом (100) показывал бы недосев", () => {
    const withOldBrokenDefault = definition.calculate({
      ...definition.defaults,
      yeastType: "dry",
      cellsPerPackBillion: 100,
      packsCount: 1,
      wortVolumeL: 20,
      gravity: 12.4,
      gravityUnit: "Plato"
    });

    expect(withOldBrokenDefault.primary.tone).toBe("warning");
  });

  // Ф-6 (фикс-раунд волны 1): touched-флаг не переживает share-ссылку (её сериализует
  // serializeCalculatorStateToQuery только по definition.fields, куда touched не входит) и не
  // защищает от повторного клика по уже активному сегменту — гейт теперь по значению.
  it("ручное 150 — даже без touched-флага — не даёт пресету затереть значение при смене типа", () => {
    const state = { ...definition.defaults, yeastType: "liquid", cellsPerPackBillion: 150 };
    expect(yeastTypeField.transformOnChange!("dry", state)).toEqual([]);
  });

  it("значение 100 строкой (как из share-ссылки, без touched) при смене типа обновляется на новый пресет", () => {
    const state = { ...definition.defaults, yeastType: "liquid", cellsPerPackBillion: "100" };
    expect(yeastTypeField.transformOnChange!("dry", state)).toEqual([["cellsPerPackBillion", 200]]);
  });

  it("migrateStoredState помечает touched, если cellsPerPackBillion сохранён строкой (старый ручной ввод)", () => {
    const migrated = definition.migrateStoredState!({ yeastType: "liquid", cellsPerPackBillion: "150" });
    expect(migrated.cellsPerPackBillionTouched).toBe(true);
    expect(migrated.cellsPerPackBillion).toBe("150");
  });
});
