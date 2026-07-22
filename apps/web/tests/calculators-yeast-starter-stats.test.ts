import { describe, expect, it } from "vitest";

import { calculatorDefinitionBySlug } from "../features/calculators/definitions";

// К21 (аудит калькуляторов 2026-07-17): плотность сусла стартера (~1.036) и пропорция
// вода:DME раньше жили только текстом в статичных nextSteps каталога — теперь это числа
// из самого расчёта, показанные в статах результата. Статус внесения — одно слово из
// живого обихода вместо разговорной фразы («Мало дрожжей» → «Недосев» и т.п.).
describe("К21: статы стартера дрожжей (плотность, пропорция) и однословный статус", () => {
  const definition = calculatorDefinitionBySlug["yeast-starter"];

  it("нужен стартер (недосев) — статы несут плотность сусла и пропорцию вода:DME", () => {
    const result = definition.calculate({ ...definition.defaults, gravityUnit: "SG", gravity: 1.05 });

    expect(result.primary.value).toBe("Недосев");

    const gravityStat = result.stats.find((stat) => stat.label === "Плотность стартера");
    expect(gravityStat).toBeDefined();
    expect(gravityStat!.value).toBe("1.037");

    const ratioStat = result.stats.find((stat) => stat.label === "Пропорция");
    expect(ratioStat).toBeDefined();
    expect(ratioStat!.value).toBe("100 г DME на 1 л воды");
  });

  it("плотность стартера показывается в текущей шкале плотности (Plato), а не всегда в SG", () => {
    const result = definition.calculate({ ...definition.defaults, gravityUnit: "Plato", gravity: 12.4 });
    const gravityStat = result.stats.find((stat) => stat.label === "Плотность стартера");

    expect(gravityStat).toBeDefined();
    expect(gravityStat!.value).toContain("°P");
    // ~1.037 SG ~ 9.3 °P — разумный диапазон, не завязываемся на точный коэффициент полинома.
    expect(Number.parseFloat(gravityStat!.value)).toBeGreaterThan(8);
    expect(Number.parseFloat(gravityStat!.value)).toBeLessThan(10);
  });

  it("статус — одно слово из нового набора (Недосев/Норма/Перебор), не старые разговорные фразы", () => {
    const underpitch = definition.calculate({ ...definition.defaults, gravityUnit: "SG", gravity: 1.05 });
    expect(underpitch.primary.value).toBe("Недосев");
    expect(underpitch.primary.value).not.toBe("Мало дрожжей");

    const overpitch = definition.calculate({
      ...definition.defaults,
      gravityUnit: "SG",
      gravity: 1.03,
      packsCount: 4,
      cellsPerPackBillion: 200
    });
    expect(overpitch.primary.value).toBe("Перебор");
    expect(overpitch.primary.value).not.toBe("С запасом");

    const ok = definition.calculate({
      ...definition.defaults,
      gravityUnit: "SG",
      gravity: 1.05,
      yeastType: "dry",
      cellsPerPackBillion: 200,
      packsCount: 1
    });
    expect(ok.primary.value).toBe("Норма");
  });

  it("без нужды в стартере (режим «Без стартера») — статы плотности/пропорции не показываются", () => {
    const result = definition.calculate({ ...definition.defaults, gravityUnit: "SG", gravity: 1.05, starterMode: "none" });

    expect(result.stats.some((stat) => stat.label === "Плотность стартера")).toBe(false);
    expect(result.stats.some((stat) => stat.label === "Пропорция")).toBe(false);
  });
});
