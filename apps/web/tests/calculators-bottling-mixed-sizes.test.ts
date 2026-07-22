import { describe, expect, it } from "vitest";

import { calculatorDefinitionBySlug } from "../features/calculators/definitions";

// К16 (аудит калькуляторов 2026-07-17): «Бутылки и розлив» — реализована смешанная тара,
// которую SEO/whenToUse уже обещали (calculators/catalog.ts), а ядро раньше молча брало
// только первый размер (calculateBottling: .find(size => size > 0)). Здесь — сквозная
// проверка через calculate(): разбивку по числу тестирует calculator-tools.test.ts (ядро),
// тут — что definitions.ts честно доносит её до стат/подсказки/предупреждения.
describe("К16: смешанная тара в «Бутылки и розлив»", () => {
  const definition = calculatorDefinitionBySlug.bottling;

  it("второй размер пуст — считает как раньше (одна тара, без разбивки по стат)", () => {
    const result = definition.calculate({
      ...definition.defaults,
      beerVolumeL: 20.4,
      packagingLossL: 0,
      bottleSizeL: "0.5",
      secondBottleSizeL: ""
    });

    expect(result.primary.value).toBe("40 шт");
    expect(result.primary.helper).toBe("Остаток 0.4 л");
    expect(result.stats.map((stat) => stat.label)).toEqual(["Объём розлива"]);
    expect(result.warnings).toEqual([]);
  });

  it("два размера — разбивка по каждому, суммарный объём в таре и подсказка по остатку", () => {
    const result = definition.calculate({
      ...definition.defaults,
      beerVolumeL: 20.4,
      packagingLossL: 0,
      bottleSizeL: "0.5",
      secondBottleSizeL: "0.33"
    });

    expect(result.primary.value).toBe("41 шт");
    expect(result.primary.helper).toBe("40 × 0.5 л + 1 × 0.33 л");
    expect(result.stats).toEqual([
      { label: "Объём розлива", value: "20.4 л" },
      { label: "Бутылок 0.5 л", value: "40 шт" },
      { label: "Бутылок 0.33 л", value: "1 шт" },
      { label: "Объём в таре", value: "20.33 л" }
    ]);
    expect(result.warnings).toEqual([
      { text: "Остаток 0.07 л — добавьте ещё 1 бутылку 0.33 л.", tone: "info" }
    ]);
  });

  it("два размера делятся ровно — остатка нет, предупреждения нет", () => {
    const result = definition.calculate({
      ...definition.defaults,
      beerVolumeL: 20,
      packagingLossL: 0,
      bottleSizeL: "0.5",
      secondBottleSizeL: "0.33"
    });

    expect(result.primary.value).toBe("40 шт");
    expect(result.primary.helper).toBe("40 × 0.5 л");
    expect(result.warnings).toEqual([]);
  });

  it("сахар на литр при смешанной таре считается на КАЖДЫЙ размер отдельно (не одной дозой на все бутылки)", () => {
    const result = definition.calculate({
      ...definition.defaults,
      beerVolumeL: 20.4,
      packagingLossL: 0,
      bottleSizeL: "0.5",
      secondBottleSizeL: "0.33",
      sugarPerLiter: 6
    });

    expect(result.stats).toEqual(
      expect.arrayContaining([
        { label: "Сахар на 0.5 л", value: "3 г" },
        { label: "Сахар на 0.33 л", value: "2 г" }
      ])
    );
  });

  it("смешанная тара + потери съели весь объём — подсказка не пустая строка, а «Остаток 0 л»", () => {
    const result = definition.calculate({
      ...definition.defaults,
      beerVolumeL: 5,
      packagingLossL: 5,
      bottleSizeL: "0.5",
      secondBottleSizeL: "0.33"
    });

    expect(result.primary.value).toBe("0 шт");
    expect(result.primary.helper).toBe("Остаток 0 л");
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        { text: "Потери при розливе не меньше объёма пива — бутылок не получится. Проверьте «Потери при розливе».", tone: "warning" }
      ])
    );
  });
});
