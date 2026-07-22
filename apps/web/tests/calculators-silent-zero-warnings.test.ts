import { describe, expect, it } from "vitest";

import { calculatorDefinitionBySlug } from "../features/calculators/definitions";

// К4 (аудит калькуляторов 2026-07-17): "0" как результат без пояснения — тихая ложь.
// Три места чинятся здесь; сами коды предупреждений и их перевод проверяет
// calculator-tools.test.ts (ядро) — тут проверяем сквозную подачу через calculate().
describe("К4: предупреждения вместо молчаливых нулей", () => {
  it("шпайзе: targetCo2 ≤ residualCo2 — предупреждение «добавка не нужна» вместо тихих 0 л", () => {
    const definition = calculatorDefinitionBySlug["speise-krausen"];

    const alreadyCarbonated = definition.calculate({
      ...definition.defaults,
      beerVolumeL: 20,
      targetCo2: 0.5,
      temperatureC: 20
    });

    expect(alreadyCarbonated.primary.value).toBe("0 л");
    expect(alreadyCarbonated.warnings).toEqual([
      { text: "Пиво уже карбонизировано до цели — добавка не нужна.", tone: "info" }
    ]);

    const stillNeedsSpeise = definition.calculate({
      ...definition.defaults,
      beerVolumeL: 20,
      targetCo2: 2.4,
      temperatureC: 20
    });
    expect(stillNeedsSpeise.warnings).toEqual([]);
  });

  it("бутылки: потери ≥ объёма — предупреждение вместо молчаливых «0 шт»", () => {
    const definition = calculatorDefinitionBySlug.bottling;

    const allLost = definition.calculate({
      ...definition.defaults,
      beerVolumeL: 5,
      packagingLossL: 5
    });

    expect(allLost.primary.value).toBe("0 шт");
    expect(allLost.warnings).toEqual([
      { text: "Потери при розливе не меньше объёма пива — бутылок не получится. Проверьте «Потери при розливе».", tone: "warning" }
    ]);

    const normal = definition.calculate({ ...definition.defaults, beerVolumeL: 20, packagingLossL: 0.5 });
    expect(normal.warnings).toEqual([]);
  });

  it("эффективность варки, режим «Прогноз»: пустая засыпь — «—» + предупреждение, а не «0.0 °P»", () => {
    const definition = calculatorDefinitionBySlug["brewhouse-efficiency"];

    const emptyGrainBill = definition.calculate({
      ...definition.defaults,
      mode: "predict",
      fermentables: [],
      brewhouseEfficiencyPercent: 75
    });

    expect(emptyGrainBill.primary.value).toBe("—");
    // Ф-3 (фикс-раунд волны 1): текст — про прогноз, а не про эффективность (эффективность в
    // этом режиме — входной параметр, а не то, что тут считается).
    expect(emptyGrainBill.warnings).toEqual([
      { text: "В засыпи нет позиций с указанным потенциалом — прогнозировать плотность не из чего", tone: "warning" }
    ]);
    // Ссылка "Посчитать крепость по этой НП" утекала бы og=1.000 из невалидного прогноза —
    // в невалидной ветке её быть не должно.
    expect(emptyGrainBill.links?.some((link) => link.label === "Посчитать крепость по этой НП")).toBe(false);

    const noPotential = definition.calculate({
      ...definition.defaults,
      mode: "predict",
      fermentables: [{ name: "Что-то без экстрактивности", weightKg: 1, ppg: "", mashed: "1" }],
      brewhouseEfficiencyPercent: 75
    });
    expect(noPotential.primary.value).toBe("—");
    expect(noPotential.warnings).toEqual([
      { text: "В засыпи нет позиций с указанным потенциалом — прогнозировать плотность не из чего", tone: "warning" }
    ]);

    const normalGrainBill = definition.calculate({
      ...definition.defaults,
      mode: "predict",
      brewhouseEfficiencyPercent: 75
    });
    expect(normalGrainBill.primary.value).not.toBe("—");
    expect(normalGrainBill.warnings).toBeUndefined();
  });

  // Ф-3 (фикс-раунд волны 1): assessGrainBillPotential смотрит только на затираемое зерно —
  // чисто экстрактная засыпь ("Сахар и экстракт" везде) давала "—" + враньё про эффективность,
  // хотя экстракт растворяется на 100% независимо от неё и прогноз считается прекрасно.
  it("эффективность варки, режим «Прогноз»: чисто экстрактная засыпь прогнозируется без предупреждений", () => {
    const definition = calculatorDefinitionBySlug["brewhouse-efficiency"];

    const extractOnly = definition.calculate({
      ...definition.defaults,
      mode: "predict",
      gravityUnit: "SG",
      batchVolumeL: 20,
      fermentables: [{ name: "Сухой солодовый экстракт (DME)", weightKg: 3, ppg: 44, mashed: "0" }],
      brewhouseEfficiencyPercent: 75
    });

    expect(extractOnly.primary.value).not.toBe("—");
    expect(Number.parseFloat(extractOnly.primary.value)).toBeCloseTo(1.055, 3);
    expect(extractOnly.warnings).toBeUndefined();
    expect(extractOnly.links?.some((link) => link.label === "Посчитать крепость по этой НП")).toBe(true);
  });
});
