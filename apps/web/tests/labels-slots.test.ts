import { describe, expect, it } from "vitest";

import { resolveQrPrintState } from "../features/labels/render";
import { appendQrBottlingFacts, buildCustomLabelSlots, buildLabelSlots, extractQrAbvNumber } from "../features/labels/slots";
import type { RecipeDetailDto } from "../features/recipes/contracts";

// Минимальный рецепт для сборки слотов: интересующие поля + пустые ингредиенты.
const baseRecipe = {
  id: "r1",
  title: "Тестовый эль",
  slug: "testovyy-el",
  styleId: null,
  publicationState: "published",
  abv: 5.234,
  ibu: 37.6,
  color: 6.09, // SRM → EBC ≈ 12
  og: 1.048,
  fg: 1.011,
  authorDisplayName: "Артём",
  ingredients: []
} as unknown as RecipeDetailDto;

describe("buildLabelSlots", () => {
  it("QR опубликованного ведёт на страницу пива открытой ссылкой", () => {
    const published = buildLabelSlots({ recipe: baseRecipe, baseUrl: "https://nb.example/" });
    expect(published.qrUrl).toBe("https://nb.example/beer/testovyy-el");
  });

  it("QR непубличного — только с share-ключом; без ключа QR нет", () => {
    for (const state of ["private", "draft"] as const) {
      const recipe = { ...baseRecipe, publicationState: state } as RecipeDetailDto;
      expect(buildLabelSlots({ recipe, baseUrl: "https://nb.example", shareKey: "abc123" }).qrUrl).toBe(
        "https://nb.example/beer/testovyy-el?k=abc123"
      );
      expect(buildLabelSlots({ recipe, baseUrl: "https://nb.example" }).qrUrl).toBeNull();
    }
  });

  it("плотность печатается в °P по умолчанию (в СНГ плотность — в Плато)", () => {
    const slots = buildLabelSlots({ recipe: baseRecipe, baseUrl: "https://nb.example" });
    expect(slots.abvText).toBe("~5.2%");
    expect(slots.ibu).toBe(38);
    expect(slots.ebc).toBe(12);
    // Число и единица разъехались намеренно: «°P» печатает шаблон — один раз на
    // строку «OG · FG», а не после каждого значения.
    expect(slots.ogText).toBe("11.9");
    expect(slots.fgText).toBe("2.8");
    expect(slots.gravityUnitText).toBe("°P");
  });

  it("единица плотности берётся из настройки пользователя", () => {
    const slots = buildLabelSlots({ recipe: baseRecipe, baseUrl: "https://nb.example", gravityUnit: "sg" });
    expect(slots.ogText).toBe("1.048");
    expect(slots.fgText).toBe("1.011");
    // У SG суффикса нет: «1.048 SG» на бутылке не пишут.
    expect(slots.gravityUnitText).toBeNull();
  });

  it("дата розлива: без даты — null", () => {
    const withDate = buildLabelSlots({ recipe: baseRecipe, baseUrl: "https://nb.example", bottlingDate: "2026-07-11" });
    expect(withDate.bottlingDateText).toBe("11.07.2026");

    const withoutDate = buildLabelSlots({ recipe: baseRecipe, baseUrl: "https://nb.example" });
    expect(withoutDate.bottlingDateText).toBeNull();

    const invalid = buildLabelSlots({ recipe: baseRecipe, baseUrl: "https://nb.example", bottlingDate: "не дата" });
    expect(invalid.bottlingDateText).toBeNull();
  });

  it("пустые значения остаются null, а не превращаются в заглушки", () => {
    const recipe = { ...baseRecipe, abv: null, ibu: null, color: null, og: null, fg: null, authorDisplayName: null } as RecipeDetailDto;
    const slots = buildLabelSlots({ recipe, baseUrl: "https://nb.example" });
    expect(slots.abvText).toBeNull();
    expect(slots.ibu).toBeNull();
    expect(slots.ebc).toBeNull();
    expect(slots.ogText).toBeNull();
    expect(slots.fgText).toBeNull();
    expect(slots.authorName).toBeNull();
    expect(slots.yeast).toBeNull();
    expect(slots.hops).toEqual([]);
    expect(slots.malts).toEqual([]);
  });

  it("ингредиенты раскладываются по категориям", () => {
    const recipe = {
      ...baseRecipe,
      ingredients: [
        { type: "grain", ingredientCategory: "fermentable", ingredientDisplayNameRu: "Пилснер", ingredientDisplayName: "Pilsner" },
        { type: "hops", ingredientCategory: "hop", ingredientDisplayName: "Saaz" },
        { type: "yeast", ingredientCategory: "yeast", ingredientDisplayName: "W-34/70" }
      ]
    } as unknown as RecipeDetailDto;
    const slots = buildLabelSlots({ recipe, baseUrl: "https://nb.example" });
    expect(slots.malts.length).toBe(1);
    expect(slots.hops.length).toBe(1);
    expect(slots.yeast).toBeTruthy();
  });
});

// Вес движок рецепта берёт только из нормализованных граммов — доли засыпи
// считаются по тому же правилу (см. ingredientWeightG в slots.ts).
const malt = (name: string, grams: number | null, unit: "g" | "l" = "g") => ({
  type: "grain",
  ingredientCategory: "fermentable",
  ingredientDisplayName: name,
  amountNormalizedQuantity: grams ?? 0,
  amountNormalizedUnit: grams === null ? unit : "g"
});

const withMalts = (...ingredients: unknown[]): RecipeDetailDto =>
  ({ ...baseRecipe, ingredients } as unknown as RecipeDetailDto);

describe("доли солода в засыпи", () => {
  it("считаются по массе и в сумме дают ровно 100%", () => {
    const slots = buildLabelSlots({
      recipe: withMalts(malt("Pale Ale", 4850), malt("Munich", 750), malt("Cara", 400)),
      baseUrl: "https://nb.example"
    });
    // 80.83 / 12.5 / 6.67: округление вниз даёт 80+12+6=98%, остаток в 2 пункта
    // уходит сортам с наибольшей дробной частью (Pale .83 и Cara .67).
    expect(slots.malts).toEqual(["Pale Ale 81%", "Munich 12%", "Cara 7%"]);
    const sum = slots.malts.reduce((acc, item) => acc + Number(item.match(/(\d+)%$/)?.[1]), 0);
    expect(sum).toBe(100);
  });

  it("сорт легче половины процента печатается как «<1%», а не «0%»", () => {
    const slots = buildLabelSlots({
      recipe: withMalts(malt("Pale Ale", 5000), malt("Acid Malt", 20)),
      baseUrl: "https://nb.example"
    });
    expect(slots.malts[1]).toBe("Acid Malt <1%");
  });

  it("единственный солод — без доли: «100%» ничего не сообщает", () => {
    const slots = buildLabelSlots({ recipe: withMalts(malt("Pilsner", 5000)), baseUrl: "https://nb.example" });
    expect(slots.malts).toEqual(["Pilsner"]);
  });

  it("одинаковые сорта складываются в одну строку", () => {
    const slots = buildLabelSlots({
      recipe: withMalts(malt("Pilsner", 2500), malt("Pilsner", 2500), malt("Munich", 1000)),
      baseUrl: "https://nb.example"
    });
    expect(slots.malts).toEqual(["Pilsner 83%", "Munich 17%"]);
  });

  it("позиция без веса (литры экстракта) отключает доли у всей засыпи", () => {
    // Иначе сумма не сошлась бы к 100: доли остальных сортов врали бы.
    const slots = buildLabelSlots({
      recipe: withMalts(malt("Pale Ale", 4000), malt("Жидкий экстракт", null, "l")),
      baseUrl: "https://nb.example"
    });
    expect(slots.malts).toEqual(["Pale Ale", "Жидкий экстракт"]);
  });

  it("запятая в каталожном имени не разваливает сорт надвое", () => {
    // «Brown Sugar, Light» — реальное имя из каталога, а список в форме разделён
    // запятыми: без чистки на наклейку попадали бы два сорта вместо одного.
    const slots = buildLabelSlots({
      recipe: withMalts(malt("Pale Malt", 4000), malt("Brown Sugar, Light", 500)),
      baseUrl: "https://nb.example"
    });
    expect(slots.malts).toEqual(["Pale Malt 89%", "Brown Sugar Light 11%"]);
  });
});

// QR зеркалит факты розлива: дата/номер партии/переопределённый ABV, если они
// реально печатаются на этой же наклейке, уезжают в query QR-ссылки — иначе
// гость увидел бы на бутылке одно, а по QR узнал бы другое.
describe("QR несёт факты розлива", () => {
  it("все три факта разом: дата, партия, переопределённый ABV — в порядке b, n, abv", () => {
    const built = buildLabelSlots({
      recipe: baseRecipe,
      baseUrl: "https://nb.example",
      bottlingDate: "2026-07-11",
      overrides: { batch: "12", abv: "6.6%" }
    });
    expect(built.qrUrl).toBe("https://nb.example/beer/testovyy-el?b=2026-07-11&n=12&abv=6.6");
  });

  it("только дата — b без n и abv", () => {
    const built = buildLabelSlots({
      recipe: baseRecipe,
      baseUrl: "https://nb.example",
      bottlingDate: "2026-07-11"
    });
    expect(built.qrUrl).toBe("https://nb.example/beer/testovyy-el?b=2026-07-11");
  });

  it("ABV без override не попадает в QR — страница пива и так знает расчётный ABV", () => {
    // Рецепт печатает abvText («~5.2%») сам по себе, но ключа abv в правках нет —
    // это не «пользователь переопределил», а расчётное значение.
    const built = buildLabelSlots({ recipe: baseRecipe, baseUrl: "https://nb.example" });
    expect(built.abvText).toBe("~5.2%");
    expect(built.qrUrl).toBe("https://nb.example/beer/testovyy-el");
  });

  it("ABV-мусор (диапазон, не одно число) опускается, но остальные факты остаются", () => {
    const built = buildLabelSlots({
      recipe: baseRecipe,
      baseUrl: "https://nb.example",
      bottlingDate: "2026-07-11",
      overrides: { abv: "5.8–6.2%" }
    });
    expect(built.qrUrl).toBe("https://nb.example/beer/testovyy-el?b=2026-07-11");
  });

  it("«~5,6%» распознаётся как 5.6 (тильда/% убираются, запятая → точка)", () => {
    const built = buildLabelSlots({
      recipe: baseRecipe,
      baseUrl: "https://nb.example",
      overrides: { abv: "~5,6%" }
    });
    expect(built.qrUrl).toBe("https://nb.example/beer/testovyy-el?abv=5.6");
  });

  it("«~5.625%» округляется до двух знаков: abv=5.63 (больше потребитель не принимает)", () => {
    const built = buildLabelSlots({
      recipe: baseRecipe,
      baseUrl: "https://nb.example",
      overrides: { abv: "~5.625%" }
    });
    expect(built.qrUrl).toBe("https://nb.example/beer/testovyy-el?abv=5.63");
  });

  it("«0.004» после округления — ноль: параметр abv не добавляется", () => {
    const built = buildLabelSlots({
      recipe: baseRecipe,
      baseUrl: "https://nb.example",
      overrides: { abv: "0.004" }
    });
    expect(built.qrUrl).toBe("https://nb.example/beer/testovyy-el");
  });

  it("контракт с потребителем: строка abv в QR всегда матчит валидатор bottle-params", () => {
    // Зеркало ABV_RE из features/beer-page/bottle-params.ts (страница пива):
    // до 2 цифр целой части, точка и до 2 знаков дробной — что не матчит,
    // страница молча выбрасывает, и параметр ехал бы в QR впустую.
    const consumerAbvPattern = /^\d{1,2}(\.\d{1,2})?$/;
    for (const input of ["5", "5,6", "12.34", "5.625%"]) {
      const url = appendQrBottlingFacts("https://nb.example/beer/slug", "https://nb.example", {
        bottlingIso: null,
        batchText: null,
        abvText: input,
        abvOverridden: true
      });
      const abv = new URL(url).searchParams.get("abv");
      expect(abv, `вход «${input}»`).toMatch(consumerAbvPattern);
    }
  });

  it("непубличный рецепт: k сохраняется первым, порядок k→b→n→abv стабилен", () => {
    const recipe = { ...baseRecipe, publicationState: "private" } as RecipeDetailDto;
    const built = buildLabelSlots({
      recipe,
      baseUrl: "https://nb.example",
      bottlingDate: "2026-07-11",
      overrides: { batch: "7", abv: "6.6%" },
      shareKey: "abc123"
    });
    expect(built.qrUrl).toBe("https://nb.example/beer/testovyy-el?k=abc123&b=2026-07-11&n=7&abv=6.6");
  });

  it("типовой набор фактов (b+n+abv) не роняет QR на пресете M", () => {
    const built = buildLabelSlots({
      recipe: baseRecipe,
      baseUrl: "https://nb.example",
      bottlingDate: "2026-07-11",
      overrides: { batch: "12", abv: "6.6%" }
    });
    expect(resolveQrPrintState({ template: "craft", preset: "M", dpi: 203, slots: built })).toBe("ok");
    expect(resolveQrPrintState({ template: "typographic", preset: "M", dpi: 203, slots: built })).toBe("ok");
  });

  it("ручной режим: recipeQrUrl тоже получает факты розлива", () => {
    const custom = buildCustomLabelSlots({
      bottlingDate: "2026-07-11",
      overrides: { batch: "5" },
      recipeQrUrl: "https://nb.example/beer/chuzhoy-recept",
      baseUrl: "https://nb.example"
    });
    expect(custom.qrUrl).toBe("https://nb.example/beer/chuzhoy-recept?b=2026-07-11&n=5");
  });

  describe("appendQrBottlingFacts: сборка параметров — чистая функция", () => {
    it("цель QR — не /beer/: факты не добавляются вовсе", () => {
      const url = appendQrBottlingFacts("https://nb.example/recipes/some-slug", "https://nb.example", {
        bottlingIso: "2026-07-11",
        batchText: "3",
        abvText: "6.6%",
        abvOverridden: true
      });
      expect(url).toBe("https://nb.example/recipes/some-slug");
    });

    it("чужой домен цели — факты не добавляются", () => {
      const url = appendQrBottlingFacts("https://evil.example/beer/some-slug", "https://nb.example", {
        bottlingIso: "2026-07-11",
        batchText: null,
        abvText: null,
        abvOverridden: false
      });
      expect(url).toBe("https://evil.example/beer/some-slug");
    });

    it("номер партии триммится и режется до 16 символов самостоятельно", () => {
      const url = appendQrBottlingFacts("https://nb.example/beer/slug", "https://nb.example", {
        bottlingIso: null,
        batchText: "  1234567890123456789  ",
        abvText: null,
        abvOverridden: false
      });
      expect(url).toBe("https://nb.example/beer/slug?n=1234567890123456");
    });

    it("нечего добавлять — url возвращается как есть, без разбора", () => {
      const url = appendQrBottlingFacts("https://nb.example/beer/slug?k=xyz", "https://nb.example", {
        bottlingIso: null,
        batchText: null,
        abvText: null,
        abvOverridden: false
      });
      expect(url).toBe("https://nb.example/beer/slug?k=xyz");
    });
  });

  describe("extractQrAbvNumber: число ABV для QR", () => {
    it("распознаёт тильду, %, пробелы и запятую", () => {
      expect(extractQrAbvNumber("~5,6%")).toBe(5.6);
      expect(extractQrAbvNumber("6.6%")).toBe(6.6);
      expect(extractQrAbvNumber(" 7 ")).toBe(7);
    });

    it("диапазон и нечисловой текст не распознаются", () => {
      expect(extractQrAbvNumber("5.8–6.2%")).toBeNull();
      expect(extractQrAbvNumber("крепкое")).toBeNull();
      expect(extractQrAbvNumber(null)).toBeNull();
    });

    it("диапазон (0, 30]: 0 и значения выше 30 отбрасываются", () => {
      expect(extractQrAbvNumber("0%")).toBeNull();
      expect(extractQrAbvNumber("30%")).toBe(30);
      expect(extractQrAbvNumber("30.5%")).toBeNull();
    });
  });
});
