import { describe, expect, it } from "vitest";
import type { BeerStyle } from "@nb/brewing-core";

import { srmToHex } from "../features/recipes/beer-color";
import { defaultRecipeProcessMeta, type RecipeDetailDto } from "../features/recipes/contracts";
import { buildRecipeOgView } from "../features/og/models";
import { OG_COLORS } from "../features/og/theme";

const OPTS = { domain: "hmelo.example", wordmark: "NB" };

const buildRecipe = (overrides: Partial<RecipeDetailDto> = {}): RecipeDetailDto => ({
  id: "r-1",
  authorId: "u-1",
  recipeFamilyId: "rf-1",
  versionNumber: 1,
  versionCount: 1,
  publicationState: "published",
  hiddenAt: null,
  hiddenReason: null,
  title: "Курский пилснер",
  slug: "kursky-pilsner",
  styleId: "3B",
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  efficiency: 72,
  boilTimeMinutes: 90,
  og: 1.048,
  fg: 1.011,
  abv: 4.9,
  ibu: 35,
  color: 4,
  description: null,
  authorNotes: null,
  authorDisplayName: "Иван",
  processMeta: defaultRecipeProcessMeta,
  heroImageId: null,
  rating: null,
  versions: [],
  completedBrewCount: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-05T00:00:00.000Z"),
  ingredients: [],
  ...overrides
});

const style = (overrides: Partial<BeerStyle> = {}): BeerStyle => ({
  id: "3B",
  bjcpId: "3B",
  name: "Czech Premium Pale Lager",
  nameRu: "Чешский премиум пилснер",
  family: "Pale Lager",
  familyRu: "Светлый лагер",
  og: null,
  fg: null,
  abv: null,
  ibu: null,
  colorSrm: null,
  ...overrides
});

describe("buildRecipeOgView", () => {
  it("собирает eyebrow «Рецепт · <стиль> · BJCP <код>» и полный набор статов", () => {
    const view = buildRecipeOgView(buildRecipe(), style(), OPTS);

    expect(view.eyebrow).toBe("Рецепт · Чешский премиум пилснер · BJCP 3B");
    expect(view.title).toBe("Курский пилснер");
    expect(view.stats).toEqual([
      { label: "ABV", value: "4.9 %" },
      { label: "IBU", value: "35" },
      { label: "OG", value: "1.048" },
      { label: "Объём", value: "20 л" }
    ]);
    expect(view.stripColor).toBe(srmToHex(4));
    expect(view.rating).toBeNull();
    expect(view.brewedText).toBeNull();
    expect(view.domain).toBe("hmelo.example");
    expect(view.wordmark).toBe("NB");
  });

  it("без стиля — eyebrow только «Рецепт», без кода BJCP", () => {
    const view = buildRecipeOgView(buildRecipe(), null, OPTS);
    expect(view.eyebrow).toBe("Рецепт");
  });

  it("служебный bjcpId «LEGACY» не попадает в eyebrow", () => {
    const view = buildRecipeOgView(buildRecipe(), style({ bjcpId: "LEGACY" }), OPTS);
    expect(view.eyebrow).toBe("Рецепт · Чешский премиум пилснер");
  });

  it("рейтинг (запятая) и «сварен N раз» с русской плюрализацией", () => {
    const view = buildRecipeOgView(
      buildRecipe({ rating: { average: 4.7, count: 12 }, completedBrewCount: 8 }),
      style(),
      OPTS
    );
    expect(view.rating).toEqual({ value: "4,7", count: 12 });
    expect(view.brewedText).toBe("сварен 8 раз");
  });

  it("плюрализация «раза» для 2–4 варок", () => {
    const view = buildRecipeOgView(buildRecipe({ completedBrewCount: 3 }), style(), OPTS);
    expect(view.brewedText).toBe("сварен 3 раза");
  });

  it("null-статы и не-мл объём отфильтрованы (пустой список)", () => {
    const view = buildRecipeOgView(
      buildRecipe({ abv: null, ibu: null, og: null, batchSizeNormalizedUnit: "g" }),
      style(),
      OPTS
    );
    expect(view.stats).toEqual([]);
  });

  it("без цвета — нейтральная полоса", () => {
    const view = buildRecipeOgView(buildRecipe({ color: null }), style(), OPTS);
    expect(view.stripColor).toBe(OG_COLORS.neutralStrip);
  });

  it("очень тёмное пиво: полоса поднята по яркости (не сливается с фоном)", () => {
    const view = buildRecipeOgView(buildRecipe({ color: 45 }), style(), OPTS);
    // Истинный цвет стаута near-black (#1A0F0B) — на карточке заменён светлее.
    expect(view.stripColor).not.toBe(srmToHex(45));
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(view.stripColor.slice(i, i + 2), 16));
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(luminance).toBeGreaterThanOrEqual(63);
  });

  it("длинный заголовок обрезается по границе слова и уменьшает кегль", () => {
    const longTitle = "Экспериментальный тройной сухохмельный новоанглийский империал IPA на дикой воде";
    const view = buildRecipeOgView(buildRecipe({ title: longTitle }), style(), OPTS);
    expect(view.title.length).toBeLessThanOrEqual(65);
    expect(view.title.endsWith("…")).toBe(true);
    expect(view.titleFontSize).toBe(40);
  });

  it("короткий заголовок — крупный кегль", () => {
    const view = buildRecipeOgView(buildRecipe({ title: "Портер" }), style(), OPTS);
    expect(view.titleFontSize).toBe(70);
  });

  it("эмодзи в названии вырезаются (Satori тянул бы их с CDN → битый рендер)", () => {
    const view = buildRecipeOgView(buildRecipe({ title: "Портер 🔥🍺 на дубе 🇷🇺" }), style(), OPTS);
    expect(view.title).toBe("Портер на дубе");
    expect(view.title).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("название только из эмодзи — фолбэк «Рецепт»", () => {
    const view = buildRecipeOgView(buildRecipe({ title: "🍺🔥" }), style(), OPTS);
    expect(view.title).toBe("Рецепт");
  });
});
