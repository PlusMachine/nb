import { describe, expect, it } from "vitest";

import {
  calculatorSearchHints,
  matchesCalculatorQuery
} from "../components/calculators/calculators-search";
import { calculatorCardItems } from "../features/calculators/catalog";

const search = (query: string) =>
  calculatorCardItems.filter((calculator) => matchesCalculatorQuery(calculator, query));

describe("поиск калькуляторов", () => {
  it("каждая подсказка из плейсхолдера что-то находит", () => {
    for (const hint of calculatorSearchHints) {
      expect(search(hint).length, `подсказка «${hint}» ничего не находит`).toBeGreaterThan(0);
    }
  });

  it("находит калькулятор по алиасу, а не только по названию", () => {
    expect(search("brix").map((calculator) => calculator.slug)).toContain("refractometer-correction");
    expect(search("праймер").map((calculator) => calculator.slug)).toContain("priming-sugar");
    expect(search("strike").map((calculator) => calculator.slug)).toContain("mash-infusion");
  });

  it("не различает ё и е и игнорирует регистр с пробелами", () => {
    expect(search("  СВЕЖЕСТЬ  ").map((calculator) => calculator.slug)).toContain("hop-freshness");
  });

  it("на бессмысленный запрос не возвращает ничего", () => {
    expect(search("zzz")).toHaveLength(0);
  });
});
