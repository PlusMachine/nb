import { describe, expect, it } from "vitest";

import {
  calculatorDefinitionBySlug,
  computeMashInfusionView,
  initialCalculatorStateFromQuery
} from "../features/calculators/definitions";

// К15 — многоступенчатый затор в mash-infusion: три режима (strike/infusion/stepMash)
// делят унифицированные поля mashWaterL/mashTempC. computeMashInfusionView — чистая
// state → view функция (паттерн computeAbvView/computeDilutionView), которую и тестируем
// напрямую, и вызывает calculate() калькулятора.
describe("computeMashInfusionView: три режима", () => {
  const definition = calculatorDefinitionBySlug["mash-infusion"];

  it("strike (дефолт) — температура заторной воды и гидромодуль осмысленны", () => {
    const view = computeMashInfusionView({ ...definition.defaults, mode: "strike" });

    expect(view.mode).toBe("strike");
    if (view.mode !== "strike") throw new Error("unreachable");
    expect(view.strikeTempC).toBeCloseTo(72.3, 1);
    expect(view.thicknessLPerKg).toBeCloseTo(3, 2);
    expect(view.invalid).toBe(false);
  });

  it("infusion (нагрев) — следующая пауза выше текущей температуры затора, доливаем кипяток", () => {
    const view = computeMashInfusionView({
      ...definition.defaults,
      mode: "infusion",
      grainKg: 5,
      mashWaterL: 15,
      mashTempC: 50,
      nextPauseTempC: 66,
      infusionWaterTempC: 98
    });

    expect(view.mode).toBe("infusion");
    if (view.mode !== "infusion") throw new Error("unreachable");
    expect(view.cooling).toBe(false);
    expect(view.infusionVolumeL).toBeCloseTo(8.5, 1);
    expect(view.newTotalWaterL).toBeCloseTo(23.5, 1);
  });

  it("infusion (обратная задача) — следующая пауза НИЖЕ текущей температуры затора, автоматически переключается на охлаждение", () => {
    const view = computeMashInfusionView({
      ...definition.defaults,
      mode: "infusion",
      grainKg: 5,
      mashWaterL: 20,
      mashTempC: 72,
      nextPauseTempC: 66,
      infusionWaterTempC: 15
    });

    expect(view.mode).toBe("infusion");
    if (view.mode !== "infusion") throw new Error("unreachable");
    expect(view.cooling).toBe(true);
    expect(view.infusionVolumeL).toBeCloseTo(2.6, 1);
    expect(view.newTotalWaterL).toBeCloseTo(22.59, 1);
    expect(view.newThicknessLPerKg).toBeCloseTo(4.52, 1);
  });

  it("infusion (обратная задача) — пустое поле температуры долива фолбэчится на холодную воду (15), а не на кипяток (98)", () => {
    const withExplicitCold = computeMashInfusionView({
      ...definition.defaults,
      mode: "infusion",
      mashWaterL: 20,
      mashTempC: 72,
      nextPauseTempC: 66,
      infusionWaterTempC: 15
    });
    const withEmptyField = computeMashInfusionView({
      ...definition.defaults,
      mode: "infusion",
      mashWaterL: 20,
      mashTempC: 72,
      nextPauseTempC: 66,
      infusionWaterTempC: ""
    });

    expect(withEmptyField).toEqual(withExplicitCold);
  });

  it("stepMash (дефолт) — 2 ступени, итог без mash_thickness_unusual", () => {
    const view = computeMashInfusionView({ ...definition.defaults, mode: "stepMash" });

    expect(view.mode).toBe("stepMash");
    if (view.mode !== "stepMash") throw new Error("unreachable");
    expect(view.steps).toHaveLength(2);
    expect(view.steps[0].targetTempC).toBe(72);
    expect(view.steps[1].targetTempC).toBe(76);
    // Масса воды копится между ступенями: вторая ступень считается от объёма ПОСЛЕ первого
    // долива (~18.93 л), а не от стартовых 15 л — иначе объём получился бы заметно больше.
    expect(view.steps[1].infusionVolumeL).toBeGreaterThan(view.steps[0].infusionVolumeL - 0.5);
    expect(view.totalInfusionL).toBeCloseTo(7.8, 1);
    expect(view.totalWaterL).toBeCloseTo(22.75, 1);
    expect(view.finalThicknessLPerKg).toBeCloseTo(4.55, 2);
    expect(view.warnings).not.toContain("mash_thickness_unusual");
  });

  it("stepMash — лестница [63, 72, 76] от старта 50 °C: накопление объёма регрессия (шаг 2 считается от увеличенного объёма после шага 1)", () => {
    const view = computeMashInfusionView({
      ...definition.defaults,
      mode: "stepMash",
      grainKg: 5,
      mashWaterL: 15,
      mashTempC: 50,
      infusionWaterTempC: 100,
      pauses: [{ targetTempC: 63 }, { targetTempC: 72 }, { targetTempC: 76 }]
    });

    expect(view.mode).toBe("stepMash");
    if (view.mode !== "stepMash") throw new Error("unreachable");
    expect(view.steps[0].infusionVolumeL).toBeCloseTo(6.0, 1);
    // РЕГРЕСС: если бы объём не копился, шаг 2 считался бы от стартовых 15 л и дал ~5.5 л.
    expect(view.steps[1].infusionVolumeL).toBeCloseTo(7.4, 1);
    expect(view.steps[1].infusionVolumeL).not.toBeCloseTo(5.5, 1);
    expect(view.steps[2].infusionVolumeL).toBeCloseTo(5.1, 1);
    expect(view.finalThicknessLPerKg).toBeCloseTo(6.69, 1);
    expect(view.warnings).toContain("mash_thickness_unusual");
  });

  // РЕГРЕСС (ревью К15): пауза, равная температуре долива, давала нулевой знаменатель
  // уравнения — Infinity в объёме ступени заражал runningWaterL и все итоги.
  it("stepMash — пауза, равная температуре долива: нули и предупреждение вместо Infinity", () => {
    const view = computeMashInfusionView({
      ...definition.defaults,
      mode: "stepMash",
      infusionWaterTempC: 76,
      pauses: [{ targetTempC: 76 }, { targetTempC: 78 }]
    });

    expect(view.mode).toBe("stepMash");
    if (view.mode !== "stepMash") throw new Error("unreachable");
    expect(view.steps[0].infusionVolumeL).toBe(0);
    expect(Number.isFinite(view.totalWaterL)).toBe(true);
    expect(Number.isFinite(view.finalThicknessLPerKg)).toBe(true);
    expect(view.warnings).toContain("infusion_temp_not_above_target");
  });
});

describe("mash-infusion: миграция легаси-состояний (currentMashWaterL/currentTempC/targetTempC → mashWaterL/mashTempC)", () => {
  const definition = calculatorDefinitionBySlug["mash-infusion"];

  it("strike: targetTempC → mashTempC, старый ключ удалён", () => {
    const migrated = definition.migrateStoredState!({ mode: "strike", grainKg: 5, mashWaterL: 15, targetTempC: 68 });

    expect(migrated.mashTempC).toBe(68);
    expect(migrated.targetTempC).toBeUndefined();
  });

  it("infusion: currentMashWaterL/currentTempC → mashWaterL/mashTempC, старые ключи удалены", () => {
    const migrated = definition.migrateStoredState!({
      mode: "infusion",
      grainKg: 5,
      currentMashWaterL: 18,
      currentTempC: 63,
      nextPauseTempC: 72
    });

    expect(migrated.mashWaterL).toBe(18);
    expect(migrated.mashTempC).toBe(63);
    expect(migrated.currentMashWaterL).toBeUndefined();
    expect(migrated.currentTempC).toBeUndefined();
  });

  it("уже новая форма (mashWaterL/mashTempC заданы) — не перезаписываем", () => {
    const stored = { mode: "infusion", mashWaterL: 20, mashTempC: 65 };

    expect(definition.migrateStoredState!(stored)).toEqual(stored);
  });

  // РЕГРЕСС (ревью К15): настоящее легаси-состояние несёт ОБА набора ключей (старая форма
  // держала поля обоих режимов в defaults) — в infusion-режиме mashWaterL это скрытое
  // strike-поле (нетронутые 15), а реальный объём затора лежит в currentMashWaterL.
  it("infusion: полное легаси-состояние с обоими наборами ключей — current* побеждает strike-поля", () => {
    const migrated = definition.migrateStoredState!({
      mode: "infusion",
      grainKg: 5,
      mashWaterL: 15,
      targetTempC: 66,
      currentMashWaterL: 18,
      currentTempC: 55,
      nextPauseTempC: 72
    });

    expect(migrated.mashWaterL).toBe(18);
    expect(migrated.mashTempC).toBe(55);
    expect(migrated.currentMashWaterL).toBeUndefined();
    expect(migrated.currentTempC).toBeUndefined();
    expect(migrated.targetTempC).toBeUndefined();
  });

  it("strike: полное легаси-состояние — mashWaterL/targetTempC побеждают current*-поля", () => {
    const migrated = definition.migrateStoredState!({
      mode: "strike",
      grainKg: 5,
      mashWaterL: 18,
      targetTempC: 68,
      currentMashWaterL: 15,
      currentTempC: 63
    });

    expect(migrated.mashWaterL).toBe(18);
    expect(migrated.mashTempC).toBe(68);
  });
});

describe("mash-infusion: applyQuery — легаси share-ссылки несут поля обоих режимов", () => {
  const definition = calculatorDefinitionBySlug["mash-infusion"];

  // РЕГРЕСС (ревью К15): старый сериализатор писал ВСЕ непустые скалярные поля независимо
  // от visibleWhen — легаси-ссылка infusion-режима восстанавливалась числами strike-вкладки
  // (15 л / 66 °C вместо реальных 18 л / 55 °C) и молча занижала долив втрое.
  it("легаси-ссылка infusion: current*-ключи побеждают strike-поля", () => {
    const restored = initialCalculatorStateFromQuery(definition, {
      mode: "infusion",
      mashWaterL: "15",
      targetTempC: "66",
      currentMashWaterL: "18",
      currentTempC: "55",
      nextPauseTempC: "72",
      infusionWaterTempC: "98"
    });

    expect(restored.mashWaterL).toBe("18");
    expect(restored.mashTempC).toBe("55");

    const view = computeMashInfusionView(restored);
    expect(view.mode).toBe("infusion");
    if (view.mode !== "infusion") throw new Error("unreachable");
    expect(view.cooling).toBe(false);
    expect(view.infusionVolumeL).toBeCloseTo(13.1, 1);
  });

  it("легаси-ссылка strike: mashWaterL/targetTempC побеждают current*-ключи", () => {
    const restored = initialCalculatorStateFromQuery(definition, {
      mode: "strike",
      mashWaterL: "18",
      grainTempC: "20",
      targetTempC: "68",
      currentMashWaterL: "15",
      currentTempC: "63"
    });

    expect(restored.mashWaterL).toBe("18");
    expect(restored.mashTempC).toBe("68");
  });

  it("новая ссылка с mashTempC — легаси-ключи не перетирают новый", () => {
    const restored = initialCalculatorStateFromQuery(definition, {
      mode: "infusion",
      mashTempC: "55",
      currentTempC: "63"
    });

    expect(restored.mashTempC).toBe("55");
  });
});

describe("mash-infusion: value-gate пресета температуры долива при флипе направления", () => {
  const definition = calculatorDefinitionBySlug["mash-infusion"];
  const scalarField = (name: string) => {
    const field = definition.fields.find((candidate) => candidate.kind !== "array" && candidate.name === name);
    if (!field || field.kind === "array" || !field.transformOnChange) {
      throw new Error(`нет transformOnChange у поля ${name}`);
    }
    return field;
  };

  it("нагрев → охлаждение: нетронутые 98 подменяются на 15", () => {
    const updates = scalarField("nextPauseTempC").transformOnChange!("60", {
      ...definition.defaults,
      mode: "infusion"
    });

    expect(updates).toEqual([["infusionWaterTempC", "15"]]);
  });

  it("охлаждение → нагрев: пресетные 15 подменяются на 98", () => {
    const updates = scalarField("nextPauseTempC").transformOnChange!("72", {
      ...definition.defaults,
      mode: "infusion",
      nextPauseTempC: 60,
      infusionWaterTempC: 15
    });

    expect(updates).toEqual([["infusionWaterTempC", "98"]]);
  });

  it("ручное значение долива при флипе не трогается", () => {
    const updates = scalarField("nextPauseTempC").transformOnChange!("60", {
      ...definition.defaults,
      mode: "infusion",
      infusionWaterTempC: 85
    });

    expect(updates).toEqual([]);
  });

  it("смена паузы без флипа направления ничего не меняет", () => {
    const updates = scalarField("nextPauseTempC").transformOnChange!("74", {
      ...definition.defaults,
      mode: "infusion"
    });

    expect(updates).toEqual([]);
  });

  it("флип через «Температура затора» тоже подменяет пресет", () => {
    const updates = scalarField("mashTempC").transformOnChange!("80", {
      ...definition.defaults,
      mode: "infusion"
    });

    expect(updates).toEqual([["infusionWaterTempC", "15"]]);
  });

  it("переключение в «Ступенчатый затор» возвращает пресетные 15 к кипятку (лестница всегда кипятком)", () => {
    const updates = scalarField("mode").transformOnChange!("stepMash", {
      ...definition.defaults,
      mode: "infusion",
      nextPauseTempC: 60,
      infusionWaterTempC: 15
    });

    expect(updates).toEqual([["infusionWaterTempC", "98"]]);
  });

  it("переключение в «Долив на ступень» при охлаждающем направлении подменяет 98 на 15", () => {
    const updates = scalarField("mode").transformOnChange!("infusion", {
      ...definition.defaults,
      mode: "strike",
      mashTempC: 80
    });

    expect(updates).toEqual([["infusionWaterTempC", "15"]]);
  });
});
