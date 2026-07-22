import { describe, expect, it } from "vitest";

import {
  applyTokenVariantGroups,
  buildLayoutQueryVariants,
  buildSearchQueryVariants,
  escapeLikePattern,
  foldSearchDiacritics,
  normalizeSearchText,
  swapKeyboardLayout,
  transliterateLatToRu,
  transliterateRuToLat
} from "./engine";

describe("normalizeSearchText", () => {
  it("схлопывает ё→е, пунктуацию и пробелы, приводит к нижнему регистру", () => {
    expect(normalizeSearchText("Кёльш!")).toBe("кельш");
    expect(normalizeSearchText("  multiple   spaces ")).toBe("multiple spaces");
    expect(normalizeSearchText("under_score/slash|pipe")).toBe("under score slash pipe");
  });

  it("NFKC компонует, но НЕ фолдит диакритику", () => {
    // "e" + combining acute accent (U+0301) → NFKC компонует в precomposed "é".
    expect(normalizeSearchText("é")).toBe("é");
    expect(normalizeSearchText("Kölsch")).toBe("kölsch");
  });
});

describe("foldSearchDiacritics", () => {
  it("Kölsch → kolsch (NFKD + удаление combining marks)", () => {
    expect(normalizeSearchText(foldSearchDiacritics("Kölsch"))).toBe("kolsch");
  });

  it("ß → ss", () => {
    expect(normalizeSearchText(foldSearchDiacritics("Weiße"))).toBe("weisse");
  });
});

describe("транслитерация", () => {
  it("ru → lat", () => {
    expect(transliterateRuToLat("пилснер")).toBe("pilsner");
  });

  it("lat → ru", () => {
    expect(transliterateLatToRu("pilsner")).toBe("пилснер");
  });

  it("латинское s транслитерируется в с (наивный посимвольный транслит, не то же самое, что раскладка)", () => {
    expect(transliterateLatToRu("mosaic")).toBe("мосаик");
  });
});

describe("swapKeyboardLayout", () => {
  it("маппит буквы ДО нормализации — пунктуационные клавиши раскладки не теряются", () => {
    // l,f,",",t,k → д,а,б,е,л (","/б — пунктуационная клавиша раскладки).
    expect(swapKeyboardLayout("lf,tk")).toBe("дабел");
  });

  it("vjpfbr → мозаик", () => {
    expect(swapKeyboardLayout("vjpfbr")).toBe("мозаик");
  });

  it("дуб (короткое кириллическое слово) не топится раскладочным мусором", () => {
    expect(swapKeyboardLayout("дуб")).toBe("le");
    // Важно: это не то же самое, что normalizeSearchText("дуб") — раскладка не no-op.
    expect(swapKeyboardLayout("дуб")).not.toBe(normalizeSearchText("дуб"));
  });
});

describe("applyTokenVariantGroups", () => {
  const groups = [["pilsner", "pils", "пилснер"]] as const;

  it("подставляет синонимы группы по префиксному совпадению токена", () => {
    const variants = applyTokenVariantGroups("pils", groups);
    expect(variants).toContain("pils");
    expect(variants).toContain("pilsner");
    expect(variants).toContain("пилснер");
  });

  it("пустая строка → пустой массив", () => {
    expect(applyTokenVariantGroups("   ", groups)).toEqual([]);
  });
});

describe("buildSearchQueryVariants", () => {
  it("без флага includeLayoutVariants раскладочных вариантов нет", () => {
    const variants = buildSearchQueryVariants("vjpfbr");
    expect(variants).not.toContain("мозаик");
  });

  it("с флагом includeLayoutVariants: true раскладочные варианты есть", () => {
    const variants = buildSearchQueryVariants("vjpfbr", { includeLayoutVariants: true });
    expect(variants).toContain("мозаик");
  });

  it("применяет tokenVariantGroups (в т.ч. через обратный транслит)", () => {
    const groups = [["pilsner", "pils", "пилснер"]] as const;
    const variants = buildSearchQueryVariants("pils", { tokenVariantGroups: groups });
    expect(variants).toContain("pilsner");
    expect(variants).toContain("пилснер");
  });

  it("cap 16 вариантов", () => {
    const bigGroup = Array.from({ length: 30 }, (_, index) => `synonym${index}`);
    const variants = buildSearchQueryVariants(bigGroup[0], { tokenVariantGroups: [bigGroup] });
    expect(variants.length).toBeLessThanOrEqual(16);
  });

  it("пустой запрос → пустой массив", () => {
    expect(buildSearchQueryVariants("   ")).toEqual([]);
  });
});

describe("escapeLikePattern", () => {
  it("экранирует %, _ и \\ обратным слэшем (ESCAPE-символ Postgres по умолчанию)", () => {
    expect(escapeLikePattern("50%off")).toBe("50\\%off");
    expect(escapeLikePattern("under_score")).toBe("under\\_score");
    expect(escapeLikePattern("back\\slash")).toBe("back\\\\slash");
  });

  it("строку без служебных символов не трогает", () => {
    expect(escapeLikePattern("citra")).toBe("citra");
  });
});

describe("buildLayoutQueryVariants", () => {
  it("пусто, когда swapKeyboardLayout(query) === base", () => {
    expect(buildLayoutQueryVariants("123")).toEqual([]);
  });

  it("даёт варианты со сменённой раскладкой и не включает base", () => {
    const variants = buildLayoutQueryVariants("vjpfbr");
    expect(variants).toContain("мозаик");
    expect(variants).not.toContain("vjpfbr");
  });

  it("учитывает tokenVariantGroups по образцу buildBjcpLayoutQueryVariants", () => {
    const groups = [["mosaic", "мозаик", "мозаика"]] as const;
    const variants = buildLayoutQueryVariants("vjpfbr", { tokenVariantGroups: groups });
    expect(variants).toContain("мозаика");
  });
});
