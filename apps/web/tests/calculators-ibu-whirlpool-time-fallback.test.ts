import { describe, expect, it } from "vitest";

import { calculatorDefinitionBySlug } from "../features/calculators/definitions";

// К5 (аудит калькуляторов 2026-07-17): глобальное поле "Отстой после кипячения" раньше
// управляло только переносом горечи кипятильных внесений в вирпул — строки типа "Вирпул"
// считались по своему полю "Время внесения", и его пустое значение читалось как 0 (внесли
// и сразу слили), а не как "то же время, что и общий отстой". Дефолты 15/15 совпадали
// только случайно. Теперь пустое время у вирпул-строки — фолбэк на глобальное поле.
describe("К5: пустое время у вирпул-строки IBU падает на глобальный «Отстой после кипячения»", () => {
  const definition = calculatorDefinitionBySlug.ibu;

  const stateWithEmptyWhirlpoolRowTime = {
    ...definition.defaults,
    formula: "tinseth_whirlpool_v2",
    additions: [
      { name: "Аромат", amountG: 30, alphaAcidPercent: 8, timeMinutes: "", use: "whirlpool", form: "pellet" }
    ]
  };

  it("изменение глобального времени меняет IBU вирпул-строки с пустым временем", () => {
    const withShortGlobalWhirlpool = definition.calculate({
      ...stateWithEmptyWhirlpoolRowTime,
      whirlpoolTimeMinutes: 5
    });
    const withLongGlobalWhirlpool = definition.calculate({
      ...stateWithEmptyWhirlpoolRowTime,
      whirlpoolTimeMinutes: 30
    });

    expect(withLongGlobalWhirlpool.primary.value).not.toBe(withShortGlobalWhirlpool.primary.value);
    expect(Number(withLongGlobalWhirlpool.primary.value)).toBeGreaterThan(Number(withShortGlobalWhirlpool.primary.value));
  });

  it("пустое время вирпул-строки при глобальном X совпадает с явно вписанным X в саму строку", () => {
    const withEmptyRowTime = definition.calculate({ ...stateWithEmptyWhirlpoolRowTime, whirlpoolTimeMinutes: 20 });
    const withExplicitRowTime = definition.calculate({
      ...stateWithEmptyWhirlpoolRowTime,
      whirlpoolTimeMinutes: 20,
      additions: [
        { name: "Аромат", amountG: 30, alphaAcidPercent: 8, timeMinutes: 20, use: "whirlpool", form: "pellet" }
      ]
    });

    expect(withEmptyRowTime.primary.value).toBe(withExplicitRowTime.primary.value);
  });

  it("явно заполненное время строки НЕ переопределяется глобальным полем", () => {
    const withOwnRowTime = definition.calculate({
      ...definition.defaults,
      formula: "tinseth_whirlpool_v2",
      whirlpoolTimeMinutes: 5,
      additions: [
        { name: "Аромат", amountG: 30, alphaAcidPercent: 8, timeMinutes: 30, use: "whirlpool", form: "pellet" }
      ]
    });
    const withDifferentGlobal = definition.calculate({
      ...definition.defaults,
      formula: "tinseth_whirlpool_v2",
      whirlpoolTimeMinutes: 99,
      additions: [
        { name: "Аромат", amountG: 30, alphaAcidPercent: 8, timeMinutes: 30, use: "whirlpool", form: "pellet" }
      ]
    });

    expect(withOwnRowTime.primary.value).toBe(withDifferentGlobal.primary.value);
  });

  it("пустое время у кипятильной (не вирпул) строки — фолбэк 0, а не глобальное поле", () => {
    // Сама итоговая IBU у кипятильного внесения с boilTimeMinutes=0 законно зависит от
    // глобального отстоя через перенос горечи в вирпул (boil_carryover) — это отдельный,
    // не связанный с К5 механизм. Проверяем не итоговую IBU, а собственное отображаемое
    // время строки (helper "масса · время"), которое и есть предмет фолбэка К5.
    const boilRowState = {
      ...definition.defaults,
      formula: "tinseth_whirlpool_v2",
      additions: [
        { name: "Горечь", amountG: 20, alphaAcidPercent: 10, timeMinutes: "", use: "boil", form: "pellet" }
      ]
    };
    const ownRowHelper = (result: ReturnType<typeof definition.calculate>) => (
      result.stats.find((stat) => stat.helper?.includes(" г · "))?.helper
    );

    const withShortGlobalWhirlpool = definition.calculate({ ...boilRowState, whirlpoolTimeMinutes: 5 });
    const withLongGlobalWhirlpool = definition.calculate({ ...boilRowState, whirlpoolTimeMinutes: 30 });

    expect(ownRowHelper(withShortGlobalWhirlpool)).toBe("20 г · 0 мин");
    expect(ownRowHelper(withLongGlobalWhirlpool)).toBe("20 г · 0 мин");
  });
});
