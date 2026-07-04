import { describe, expect, it } from "vitest";

import type { BjcpCatalogStyle } from "@nb/content";

import { buildHeroStyleVitals, HERO_STYLE_CODES, parseNumericRange } from "../features/home/style-vitals";

describe("parseNumericRange", () => {
  it("парсит диапазон вне зависимости от разделителя", () => {
    // Три реальных варианта сепаратора из данных BJCP.
    expect(parseNumericRange("1.044 - 1.048")).toEqual({ min: 1.044, max: 1.048 });
    expect(parseNumericRange("1.044-1.053")).toEqual({ min: 1.044, max: 1.053 });
    expect(parseNumericRange("1.056 – 1.070")).toEqual({ min: 1.056, max: 1.07 });
  });

  it("срезает знак процента и прочий хвост", () => {
    expect(parseNumericRange("4.7 - 5.4%")).toEqual({ min: 4.7, max: 5.4 });
    expect(parseNumericRange("16 - 22")).toEqual({ min: 16, max: 22 });
  });

  it("одно число → диапазон-точка", () => {
    expect(parseNumericRange("5")).toEqual({ min: 5, max: 5 });
  });

  it("нормализует перевёрнутый порядок", () => {
    expect(parseNumericRange("40 - 25")).toEqual({ min: 25, max: 40 });
  });

  it("пусто/мусор → null", () => {
    expect(parseNumericRange(null)).toBeNull();
    expect(parseNumericRange("")).toBeNull();
    expect(parseNumericRange("варьируется")).toBeNull();
  });
});

const makeStyle = (over: Partial<BjcpCatalogStyle> & { bjcpId: string }): BjcpCatalogStyle =>
  ({
    slug: `bjcp-${over.bjcpId.toLowerCase()}`,
    title: `Стиль ${over.bjcpId}`,
    vitalStatistics: {
      og: "1.044 - 1.048",
      fg: "1.006 - 1.012",
      ibu: "16 - 22",
      srm: "3 - 5",
      abv: "4.7 - 5.4%",
      note: null,
      sessionAbv: null,
      standardAbv: null,
      doubleAbv: null
    },
    ...over
  }) as unknown as BjcpCatalogStyle;

describe("buildHeroStyleVitals", () => {
  it("резолвит 6 кодов в фиксированном порядке и форматирует строки", () => {
    const styles = HERO_STYLE_CODES.map((code) => makeStyle({ bjcpId: code }));
    const vitals = buildHeroStyleVitals(styles);

    expect(vitals.map((v) => v.bjcpId)).toEqual([...HERO_STYLE_CODES]);
    const helles = vitals[0];
    expect(helles.href).toBe("/bjcp/bjcp-4a");
    expect(helles.ibu).toBe("16–22");
    expect(helles.abv).toBe("4.7–5.4 %");
    expect(helles.ebc).toMatch(/EBC$/);
    expect(helles.og).toMatch(/°P$/);
    // Заливка бокала — валидные CSS-цвета.
    expect(helles.glassHex).toMatch(/^#/);
    expect(helles.glassFrom).toMatch(/^rgb\(/);
  });

  it("тихо пропускает отсутствующие коды, сохраняя порядок", () => {
    const vitals = buildHeroStyleVitals([makeStyle({ bjcpId: "21A" }), makeStyle({ bjcpId: "4A" })]);
    expect(vitals.map((v) => v.bjcpId)).toEqual(["4A", "21A"]);
  });

  it("не падает на пустом каталоге", () => {
    expect(buildHeroStyleVitals([])).toEqual([]);
  });
});
