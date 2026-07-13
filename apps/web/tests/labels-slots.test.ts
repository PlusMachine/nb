import { describe, expect, it } from "vitest";

import { buildLabelSlots } from "../features/labels/slots";
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
    expect(slots.ogText).toBe("11.9 °P");
    expect(slots.fgText).toBe("2.8 °P");
  });

  it("единица плотности берётся из настройки пользователя", () => {
    const slots = buildLabelSlots({ recipe: baseRecipe, baseUrl: "https://nb.example", gravityUnit: "sg" });
    expect(slots.ogText).toBe("1.048");
    expect(slots.fgText).toBe("1.011");
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
