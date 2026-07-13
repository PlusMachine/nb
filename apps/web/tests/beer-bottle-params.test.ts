import { describe, expect, it } from "vitest";

import { parseBottleParams } from "../features/beer-page/bottle-params";

// Параметры QR недоверенные (их видно прямо в адресной строке — подставить
// может кто угодно), поэтому упор тестов на устойчивость к мусору: невалидный
// ввод должен тихо стать null, а не упасть или протащить кривые данные на
// страницу.

describe("parseBottleParams", () => {
  it("пустой ввод — всё null", () => {
    expect(parseBottleParams({})).toEqual({ bottlingDate: null, batchNo: null, abv: null });
    expect(parseBottleParams({ b: "", n: "", abv: "" })).toEqual({ bottlingDate: null, batchNo: null, abv: null });
  });

  it("валидные значения всех трёх параметров", () => {
    expect(parseBottleParams({ b: "2026-07-03", n: "3", abv: "5.6" })).toEqual({
      bottlingDate: "2026-07-03",
      batchNo: "3",
      abv: 5.6
    });
  });

  it("любая частичная комбинация", () => {
    expect(parseBottleParams({ b: "2026-07-03" })).toEqual({ bottlingDate: "2026-07-03", batchNo: null, abv: null });
    expect(parseBottleParams({ n: "IPA-12" })).toEqual({ bottlingDate: null, batchNo: "IPA-12", abv: null });
    expect(parseBottleParams({ abv: "6" })).toEqual({ bottlingDate: null, batchNo: null, abv: 6 });
  });

  describe("дата розлива (b)", () => {
    it("несуществующий месяц отклоняется", () => {
      expect(parseBottleParams({ b: "2026-13-40" }).bottlingDate).toBeNull();
    });

    it("несуществующий день (перенос через границу месяца) отклоняется", () => {
      expect(parseBottleParams({ b: "2026-02-30" }).bottlingDate).toBeNull();
    });

    it("невалидный формат отклоняется", () => {
      expect(parseBottleParams({ b: "03.07.2026" }).bottlingDate).toBeNull();
      expect(parseBottleParams({ b: "2026-7-3" }).bottlingDate).toBeNull();
      expect(parseBottleParams({ b: "not-a-date" }).bottlingDate).toBeNull();
      expect(parseBottleParams({ b: "2026-07-03T00:00:00Z" }).bottlingDate).toBeNull();
    });

    it("год вне 2000..2100 отклоняется, границы включены", () => {
      expect(parseBottleParams({ b: "1999-07-03" }).bottlingDate).toBeNull();
      expect(parseBottleParams({ b: "2101-07-03" }).bottlingDate).toBeNull();
      expect(parseBottleParams({ b: "2000-01-01" }).bottlingDate).toBe("2000-01-01");
      expect(parseBottleParams({ b: "2100-12-31" }).bottlingDate).toBe("2100-12-31");
    });

    it("29 февраля принимается только в високосный год", () => {
      expect(parseBottleParams({ b: "2024-02-29" }).bottlingDate).toBe("2024-02-29");
      expect(parseBottleParams({ b: "2026-02-29" }).bottlingDate).toBeNull();
    });
  });

  describe("номер партии (n)", () => {
    it("обрезается до 16 символов", () => {
      expect(parseBottleParams({ n: "A".repeat(40) }).batchNo).toBe("A".repeat(16));
    });

    it("тримится по краям", () => {
      expect(parseBottleParams({ n: "  3  " }).batchNo).toBe("3");
    });

    it("строка из одних пробелов — null", () => {
      expect(parseBottleParams({ n: "   " }).batchNo).toBeNull();
    });
  });

  describe("крепость (abv)", () => {
    it("не число — null", () => {
      expect(parseBottleParams({ abv: "abc" }).abv).toBeNull();
    });

    it("ноль отклоняется (диапазон исключает 0)", () => {
      expect(parseBottleParams({ abv: "0" }).abv).toBeNull();
    });

    it("значение выше 30 отклоняется", () => {
      expect(parseBottleParams({ abv: "99" }).abv).toBeNull();
      expect(parseBottleParams({ abv: "30.1" }).abv).toBeNull();
    });

    it("30 — верхняя граница включена", () => {
      expect(parseBottleParams({ abv: "30" }).abv).toBe(30);
    });

    it("запятая как десятичный разделитель", () => {
      expect(parseBottleParams({ abv: "5,6" }).abv).toBe(5.6);
    });

    it("больше двух знаков после разделителя — null", () => {
      expect(parseBottleParams({ abv: "5.678" }).abv).toBeNull();
    });
  });
});
