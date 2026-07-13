import { describe, expect, it } from "vitest";

import { renderLabelSvg } from "../features/labels/render";
import { applyLabelOverrides, buildCustomLabelSlots, buildLabelSlots, CUSTOM_LABEL_DEFAULT_TITLE } from "../features/labels/slots";
import type { LabelSlots } from "../features/labels/contracts";
import type { RecipeDetailDto } from "../features/recipes/contracts";

const baseRecipe = {
  id: "r1",
  title: "Тестовый эль",
  slug: "testovyy-el",
  styleId: null,
  publicationState: "published",
  abv: 5.2,
  ibu: 38,
  color: 6.09,
  og: 1.048,
  fg: 1.011,
  authorDisplayName: "Артём",
  ingredients: []
} as unknown as RecipeDetailDto;

const slots = (overrides: Partial<LabelSlots> = {}): LabelSlots => ({
  title: "Эль",
  styleName: "IPA",
  abvText: "~5.2%",
  ibu: 38,
  ebc: 12,
  ogText: "1.048",
  fgText: "1.011",
  hops: ["Saaz"],
  malts: ["Pilsner"],
  yeast: "W-34/70",
  volumeText: null,
  batchText: null,
  authorName: "Артём",
  bottlingDateText: "11.07.2026",
  qrUrl: "https://example.com/recipes/el",
  description: null,
  showLogo: true,
  showIbuScale: true,
  brandText: "BREWED WITH NB",
  ...overrides
});

describe("правки полей наклейки", () => {
  it("значение заменяет данные рецепта", () => {
    const result = applyLabelOverrides(slots(), { title: "Другое имя", ibu: "70", hops: "Citra, Mosaic" });
    expect(result.title).toBe("Другое имя");
    expect(result.ibu).toBe(70);
    expect(result.hops).toEqual(["Citra", "Mosaic"]);
  });

  it("пустая строка очищает поле, отсутствие ключа — оставляет как есть", () => {
    const result = applyLabelOverrides(slots(), { style: "", ibu: "", yeast: "", brand: "" });
    expect(result.styleName).toBeNull();
    expect(result.ibu).toBeNull();
    expect(result.yeast).toBeNull();
    expect(result.brandText).toBeNull();
    // Ключей нет — значения рецепта на месте.
    expect(result.ebc).toBe(12);
    expect(result.authorName).toBe("Артём");
  });

  it("название очистить нельзя: пустое — остаётся из рецепта", () => {
    expect(applyLabelOverrides(slots(), { title: "   " }).title).toBe("Эль");
  });

  it("QR можно выключить правкой, но нельзя включить у приватного рецепта", () => {
    expect(applyLabelOverrides(slots(), { qr: "0" }).qrUrl).toBeNull();
    // Приватный рецепт: qrUrl отсутствует, и qr=1 его не создаёт.
    const privateRecipe = { ...baseRecipe, publicationState: "private" } as RecipeDetailDto;
    const built = buildLabelSlots({ recipe: privateRecipe, baseUrl: "https://nb.example", overrides: { qr: "1" } });
    expect(built.qrUrl).toBeNull();
  });

  it("правки применяются при сборке слотов из рецепта", () => {
    const built = buildLabelSlots({
      recipe: baseRecipe,
      baseUrl: "https://nb.example",
      bottlingDate: "2026-07-11",
      overrides: { abv: "6.6%" }
    });
    expect(built.abvText).toBe("6.6%");
    expect(built.bottlingDateText).toBe("11.07.2026");
  });

  it("нечисловой IBU/EBC не ломает слот: остаётся значение рецепта", () => {
    const result = applyLabelOverrides(slots(), { ibu: "около сорока" });
    expect(result.ibu).toBe(38);
  });
});

describe("ручной режим (без рецепта)", () => {
  it("пустая заготовка: название по умолчанию, остальное пусто, QR нет", () => {
    const custom = buildCustomLabelSlots({});
    expect(custom.title).toBe(CUSTOM_LABEL_DEFAULT_TITLE);
    expect(custom.styleName).toBeNull();
    expect(custom.ibu).toBeNull();
    expect(custom.hops).toEqual([]);
    expect(custom.qrUrl).toBeNull();
  });

  it("поля заполняются правками, QR не появляется даже при qr=1", () => {
    const custom = buildCustomLabelSlots({
      bottlingDate: "2026-07-11",
      overrides: { title: "Гаражный портер", abv: "6.1%", ibu: "42", ebc: "60", hops: "Fuggle", qr: "1" }
    });
    expect(custom.title).toBe("Гаражный портер");
    expect(custom.ibu).toBe(42);
    expect(custom.ebc).toBe(60);
    expect(custom.hops).toEqual(["Fuggle"]);
    expect(custom.bottlingDateText).toBe("11.07.2026");
    expect(custom.qrUrl).toBeNull();

    const { svg } = renderLabelSvg({ template: "typographic", preset: "L", dpi: 203, slots: custom });
    expect(svg).not.toContain("рецепт");
    // Длинное название переносится на две строки — проверяем обе.
    expect(svg).toContain("ГАРАЖНЫЙ");
    expect(svg).toContain("ПОРТЕР");
  });
});

describe("приоритет вёрстки: заголовок ужимается, данные остаются", () => {
  // Регрессия: крупный заголовок съедал низ наклейки, и мета-блок молча
  // выбрасывал QR и строки. Данные важнее кегля названия.
  const longTitleSlots = slots({ title: "Императорский стаут", ibu: 65, ebc: 79 });

  for (const template of ["typographic", "craft"] as const) {
    it(`${template} L: QR и все мета-строки на месте при крупном заголовке`, () => {
      const { svg } = renderLabelSvg({ template, preset: "L", dpi: 203, slots: longTitleSlots });
      expect(svg).toContain("crispEdges"); // QR отрисован
      expect(svg).toContain("рецепт");
      expect(svg).toContain("РОЗЛИВ");
      expect(svg).toContain("BREWED WITH NB");
    });
  }
});

describe("шкалы: значение — точка на оси", () => {
  it("шкала горечи рисует маркер и деления, а не заливку до значения", () => {
    const { svg } = renderLabelSvg({ template: "typographic", preset: "L", dpi: 203, slots: slots() });
    expect(svg).toContain("IBU");
    // Маркер-треугольник + подпись значения над осью.
    expect(svg).toContain(">38<");
    expect(svg).toMatch(/<path d="M \d+ \d+ L \d+ \d+ L \d+ \d+ Z" fill="black"\/>/);
    // Деления оси.
    for (const tick of ["0", "20", "40", "60", "80", "100"]) {
      expect(svg).toContain(`>${tick}<`);
    }
  });

  it("шкала цвета — градиент плотности с маркером на EBC рецепта", () => {
    const { svg } = renderLabelSvg({ template: "typographic", preset: "L", dpi: 203, slots: slots({ ebc: 40 }) });
    expect(svg).toContain("EBC");
    // Несколько ступеней плотности — это и делает точки читаемой шкалой.
    const patternCount = [...svg.matchAll(/<pattern id="ebc-seg-\d+"/g)].length;
    expect(patternCount).toBeGreaterThanOrEqual(8);
  });

  it("значение за пределами шкалы не выносит маркер за ось", () => {
    const { svg, widthPx } = renderLabelSvg({ template: "typographic", preset: "L", dpi: 203, slots: slots({ ibu: 130 }) });
    expect(svg).toContain(">130<");
    // Последнее деление помечено как «100+», маркер прижат к правому краю оси.
    expect(svg).toContain(">100+<");
    for (const match of svg.matchAll(/<path d="M (\d+) \d+ L \d+ \d+ L \d+ \d+ Z" fill="black"\/>/g)) {
      expect(Number(match[1])).toBeLessThanOrEqual(widthPx);
    }
  });
});

describe("описание и переключатели блоков в правках", () => {
  it("описание берётся из правок; пустая строка = не печатать", () => {
    expect(applyLabelOverrides(slots(), { description: "Тёмный, как ночь." }).description).toBe("Тёмный, как ночь.");
    expect(applyLabelOverrides(slots({ description: "Было" }), { description: "" }).description).toBeNull();
    // Ключа нет — значение не трогаем.
    expect(applyLabelOverrides(slots({ description: "Было" }), {}).description).toBe("Было");
  });

  it("logo=0 и ibuScale=0 выключают блоки, «1» ничего не включает сверх шаблона", () => {
    expect(applyLabelOverrides(slots(), { logo: "0" }).showLogo).toBe(false);
    expect(applyLabelOverrides(slots(), { ibuScale: "0" }).showIbuScale).toBe(false);
    expect(applyLabelOverrides(slots({ showLogo: false }), { logo: "1" }).showLogo).toBe(false);
    expect(applyLabelOverrides(slots(), {}).showLogo).toBe(true);
    expect(applyLabelOverrides(slots(), {}).showIbuScale).toBe(true);
  });
});
