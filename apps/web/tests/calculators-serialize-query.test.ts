import { describe, expect, it } from "vitest";

import { sgToBrix, sgToPlato } from "@nb/brewing-core";

import {
  calculatorDefinitionBySlug,
  initialCalculatorStateFromQuery,
  serializeCalculatorStateToQuery
} from "../features/calculators/definitions";

// Round-trip для кнопки «Скопировать ссылку на расчёт»: serializeCalculatorStateToQuery
// собирает query из ТЕКУЩЕГО состояния калькулятора, initialCalculatorStateFromQuery
// восстанавливает состояние из query при открытии ссылки. Array-поля (список хмеля,
// засыпь) сериализуются как один query-ключ на поле: строки через ";", подполя внутри
// строки — через "~", в порядке объявления field.fields (см. definitions.ts).
describe("calculator query serialization round-trip", () => {
  it("abv-attenuation: og/fg/шкала восстанавливаются из скопированной ссылки", () => {
    const definition = calculatorDefinitionBySlug["abv-attenuation"];
    const state = {
      ...definition.defaults,
      og: 1.064,
      fg: 1.014,
      gravityUnit: "SG",
      abvFormula: "alternate",
      servingSizeMl: 330
    };

    const query = serializeCalculatorStateToQuery(definition, state);
    const params = Object.fromEntries(query.entries());

    expect(params.og).toBe("1.064");
    expect(params.fg).toBe("1.014");
    expect(params.gravityUnit).toBe("SG");
    expect(params.abvFormula).toBe("alternate");
    expect(params.servingSizeMl).toBe("330");

    const restored = initialCalculatorStateFromQuery(definition, params);

    // applyQuery калькулятора ABV конвертирует входящие og/fg из SG в текущую шкалу —
    // это специально для межкалькуляторных ссылок (og/fg всегда приходят в SG). Наш
    // round-trip тоже в SG, так что конверсия — identity, значения не искажаются.
    expect(String(restored.og)).toBe("1.064");
    expect(String(restored.fg)).toBe("1.014");
    expect(restored.gravityUnit).toBe("SG");
    expect(restored.abvFormula).toBe("alternate");
    expect(String(restored.servingSizeMl)).toBe("330");
  });

  it("ibu: список хмеля (2 внесения) восстанавливается из скопированной ссылки", () => {
    const definition = calculatorDefinitionBySlug.ibu;
    // "name" не входит в field.fields редактора внесений (нет такого поля в форме) —
    // сериализация/разбор его не трогают, поэтому в customAdditions его нет.
    const customAdditions = [
      { amountG: "20", alphaAcidPercent: "10", timeMinutes: "60", use: "boil", form: "pellet" },
      { amountG: "30", alphaAcidPercent: "8", timeMinutes: "15", use: "whirlpool", form: "pellet" }
    ];
    const state = {
      ...definition.defaults,
      postBoilVolumeL: 25,
      boilTimeMinutes: 45,
      formula: "tinseth_classic",
      additions: customAdditions
    };

    const query = serializeCalculatorStateToQuery(definition, state);
    const params = Object.fromEntries(query.entries());

    expect(params.postBoilVolumeL).toBe("25");
    expect(params.boilTimeMinutes).toBe("45");
    expect(params.formula).toBe("tinseth_classic");
    // Порядок подполей — amountG~alphaAcidPercent~timeMinutes~use~form, строки через ";".
    expect(params.additions).toBe("20~10~60~boil~pellet;30~8~15~whirlpool~pellet");

    const restored = initialCalculatorStateFromQuery(definition, params);

    expect(String(restored.postBoilVolumeL)).toBe("25");
    expect(String(restored.boilTimeMinutes)).toBe("45");
    expect(restored.formula).toBe("tinseth_classic");
    expect(restored.additions).toEqual(customAdditions);
  });

  it("brewhouse-efficiency: засыпь из каталога (имя/PPG/тип затирания) восстанавливается из ссылки", () => {
    const definition = calculatorDefinitionBySlug["brewhouse-efficiency"];
    const customFermentables = [
      { name: "Custom malt", weightKg: "5", ppg: "42.5", mashed: "1" },
      { name: "Crystal", weightKg: "0.5", ppg: "", mashed: "0" }
    ];
    const state = {
      ...definition.defaults,
      mode: "measure",
      batchVolumeL: 22,
      fermentables: customFermentables
    };

    const query = serializeCalculatorStateToQuery(definition, state);
    const params = Object.fromEntries(query.entries());

    expect(params.batchVolumeL).toBe("22");
    // Порядок подполей — name~weightKg~ppg~mashed, пустое ppg сериализуется как пустая строка.
    // Имя URI-экранировано (см. тест ниже про "~"/";"/кириллицу) — для ASCII без спецсимволов
    // это лишь %20 вместо пробела.
    expect(params.fermentables).toBe("Custom%20malt~5~42.5~1;Crystal~0.5~~0");

    const restored = initialCalculatorStateFromQuery(definition, params);

    expect(String(restored.batchVolumeL)).toBe("22");
    expect(restored.fermentables).toEqual(customFermentables);
  });

  // Имя ингредиента — свободный текст (из IngredientPicker или введённый руками), может
  // содержать сами служебные разделители (";" — между строками, "~" — между подполями),
  // скобки и кириллицу. encodeURIComponent экранирует ";" и кириллицу, но НЕ "~" (он не
  // входит в набор символов, которые эта функция экранирует) — потому сериализация
  // дополнительно заменяет его на %7E. Без этого имя со спецсимволами ломало бы разбор
  // строк/подполей соседних позиций засыпи.
  it("brewhouse-efficiency: имя ингредиента с «;», «~», скобками и кириллицей переживает round-trip без искажений", () => {
    const definition = calculatorDefinitionBySlug["brewhouse-efficiency"];
    const trickyFermentables = [
      { name: "Пилснер (Weyermann) — солод; партия №1 ~ остаток", weightKg: "4.5", ppg: "37", mashed: "1" },
      { name: "Мёд (акациевый)", weightKg: "0.5", ppg: "35", mashed: "0" }
    ];
    const state = {
      ...definition.defaults,
      fermentables: trickyFermentables
    };

    const query = serializeCalculatorStateToQuery(definition, state);
    const params = Object.fromEntries(query.entries());

    // Сериализованная строка не должна содержать "сырые" (неэкранированные) разделители
    // из самого имени — ровно один ";" (между строками) и по 3 "~" на строку (4 подполя).
    expect((params.fermentables.match(/;/g) ?? []).length).toBe(1);
    expect((params.fermentables.match(/~/g) ?? []).length).toBe(6);

    const restored = initialCalculatorStateFromQuery(definition, params);
    expect(restored.fermentables).toEqual(trickyFermentables);
  });

  it("array-поле: битые query-строки не портят состояние", () => {
    const definition = calculatorDefinitionBySlug["brewhouse-efficiency"];

    // Первая строка битая (не хватает подполя mashed — 3 части вместо 4), вторая валидная.
    const partiallyBroken = initialCalculatorStateFromQuery(definition, {
      fermentables: "Malt~5~37;Crystal~0.5~34~1"
    });
    expect(partiallyBroken.fermentables).toEqual([{ name: "Crystal", weightKg: "0.5", ppg: "34", mashed: "1" }]);

    // Нечисловое значение в числовом подполе (weightKg) — не мусорное число, а "не указано".
    // Неизвестное select-значение (mashed) — дефолт на первую опцию ("1", "Солод и зерно").
    const messyRow = initialCalculatorStateFromQuery(definition, {
      fermentables: "Malt~abc~10~bogus"
    });
    expect(messyRow.fermentables).toEqual([{ name: "Malt", weightKg: "", ppg: "10", mashed: "1" }]);

    // Все строки битые — поле тихо остаётся дефолтным (baseState), а не пустым массивом.
    const allBroken = initialCalculatorStateFromQuery(definition, {
      fermentables: "Malt~5"
    });
    expect(allBroken.fermentables).toEqual(definition.defaults.fermentables);
  });

  // Регрессия: "Скопировать ссылку на расчёт" пишет og/fg/wortGravity в ТЕКУЩЕЙ шкале
  // калькулятора (не в SG) плюс сам параметр шкалы (gravityUnit) — такая "самошаренная"
  // ссылка не должна повторно конвертироваться при открытии, иначе OG в °P превращался
  // в OG=180411 °P (двойная конверсия: applyQuery считал og/fg пришедшими в SG).
  it("abv-attenuation: самошаренная ссылка в °P восстанавливает og/fg точно, без двойной конверсии", () => {
    const definition = calculatorDefinitionBySlug["abv-attenuation"];
    const state = {
      ...definition.defaults,
      og: 12.5,
      fg: 3.1,
      gravityUnit: "Plato"
    };

    const query = serializeCalculatorStateToQuery(definition, state);
    const params = Object.fromEntries(query.entries());
    expect(params.gravityUnit).toBe("Plato");

    const restored = initialCalculatorStateFromQuery(definition, params);

    expect(restored.gravityUnit).toBe("Plato");
    expect(String(restored.og)).toBe("12.5");
    expect(String(restored.fg)).toBe("3.1");
  });

  it("ibu: самошаренная ссылка в °Bx восстанавливает wortGravity точно, без двойной конверсии", () => {
    const definition = calculatorDefinitionBySlug.ibu;
    const state = {
      ...definition.defaults,
      wortGravity: 14.9,
      gravityUnit: "Brix"
    };

    const query = serializeCalculatorStateToQuery(definition, state);
    const params = Object.fromEntries(query.entries());
    expect(params.gravityUnit).toBe("Brix");

    const restored = initialCalculatorStateFromQuery(definition, params);

    expect(restored.gravityUnit).toBe("Brix");
    expect(String(restored.wortGravity)).toBe("14.9");
  });

  it("abv-attenuation: легаси-ссылка ?og= без gravityUnit по-прежнему конвертируется в текущую шкалу", () => {
    const definition = calculatorDefinitionBySlug["abv-attenuation"];
    // Симулирует межкалькуляторную ссылку (напр. из рефрактометра): og приходит в SG,
    // без параметра шкалы, а текущая шкала калькулятора (уже выбранная/сохранённая) — Plato.
    const baseState = { ...definition.defaults, gravityUnit: "Plato" };

    const restored = initialCalculatorStateFromQuery(definition, { og: "1.064" }, baseState);

    expect(restored.gravityUnit).toBe("Plato");
    expect(Number(restored.og)).toBeCloseTo(Number(sgToPlato(1.064).toFixed(1)), 5);
    expect(String(restored.og)).not.toBe("1.064");
  });

  it("ibu: легаси-ссылка ?wortGravity= без gravityUnit по-прежнему конвертируется в текущую шкалу", () => {
    const definition = calculatorDefinitionBySlug.ibu;
    const baseState = { ...definition.defaults, gravityUnit: "Brix" };

    const restored = initialCalculatorStateFromQuery(definition, { wortGravity: "1.05" }, baseState);

    expect(restored.gravityUnit).toBe("Brix");
    expect(Number(restored.wortGravity)).toBeCloseTo(Number(sgToBrix(1.05).toFixed(1)), 5);
    expect(String(restored.wortGravity)).not.toBe("1.05");
  });
});

// Входящие ссылки конвертера единиц: ?group=&value=&from= (см. applyQuery unit-converter).
describe("unit-converter: входящие ссылки", () => {
  const definition = calculatorDefinitionBySlug["unit-converter"];

  it("group/value/from раскладываются в per-group ключи", () => {
    const restored = initialCalculatorStateFromQuery(definition, { group: "pressure", value: "11.6", from: "PSI" });

    expect(restored.activeGroup).toBe("pressure");
    expect(restored.pressureFrom).toBe("PSI");
    expect(restored.pressureValue).toBe("11.6");
  });

  it("from вне списка единиц группы игнорируется — остаётся единица из состояния", () => {
    // До валидации ?from=stone молча трактовался цепочкой конверсий как галлоны.
    const restored = initialCalculatorStateFromQuery(definition, { group: "volume", value: "5", from: "stone" });

    expect(restored.activeGroup).toBe("volume");
    expect(restored.volumeFrom).toBe(definition.defaults.volumeFrom);
    expect(restored.volumeValue).toBe("5");
  });

  it("легаси-ссылка ?psi= открывает давление в PSI", () => {
    const restored = initialCalculatorStateFromQuery(definition, { psi: "12" });

    expect(restored.activeGroup).toBe("pressure");
    expect(restored.pressureFrom).toBe("PSI");
    expect(restored.pressureValue).toBe("12");
  });
});
