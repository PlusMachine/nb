import { describe, expect, it } from "vitest";
import { createHomeDemoStock, homeCoverage, homeRequirements, homeQuantity, homeLoginHref, homeStockPreview, pickHomeArticles, pickHomeRecipes, type HomeRequirement } from "../features/home/landing-model";
import type { PublicRecipeListItem, RecipeDetailDto } from "../features/recipes/contracts";
import type { ContentArticleListItem } from "../features/content-articles/contracts";
const requirement = (key: string, quantity: number, category = "hop", unit = "g"): HomeRequirement => ({ key, name: key, quantity, category, unit: unit as HomeRequirement["unit"] });
describe("homepage stock demonstration", () => {
  it("covers the full first recipe and keeps shortages consistent across the shared example stock", () => {
    const recipe = (ids: string[]) => ({ ingredients: ids.map(id => ({
      type: "hop", ingredientCategory: "hop", ingredientCatalogItemId: id,
      ingredientDisplayNameRu: id, amountNormalizedQuantity: 20, amountNormalizedUnit: "g"
    })) } as RecipeDetailDto);
    const recipes = [recipe(["a", "b", "c", "d", "e", "f", "g"]), recipe(["a", "h", "i"]), recipe(["a", "j", "k", "i"])];
    const stock = createHomeDemoStock(recipes);
    const matches = recipes.map(item => homeCoverage(homeRequirements(item), stock));
    expect(matches[0]!.missing).toEqual([]);
    expect(matches[1]!.missing.map(line => line.name)).toEqual(["h"]);
    expect(matches[2]!.missing.map(line => line.name)).toEqual(["j", "k"]);
    expect(homeStockPreview(stock)).toHaveLength(4);
    expect(homeCoverage(homeRequirements(recipes[0]!), stock.map(line => ({ ...line, quantity: 0 }))).missing).toHaveLength(7);
  });
  it("does not create fractional packs or make stock up without published recipes", () => {
    const recipe = { ingredients: [{ type: "yeast", ingredientCatalogItemId: "dry", amountNormalizedQuantity: 1, amountNormalizedUnit: "pack" }] } as RecipeDetailDto;
    expect(Number.isInteger(createHomeDemoStock([recipe])[0]!.quantity)).toBe(true);
    expect(createHomeDemoStock([])).toEqual([]);
  });
  it("does not promote sample recipe titles or rewrite authors' titles", () => {
    const cards = ["Sample · Saison", "Моя APA", "Sample · American Stout"].map((name, id) => ({ id: String(id), name, style: null } as PublicRecipeListItem));
    expect(pickHomeRecipes(cards).map(item => item.name)).toEqual(["Моя APA"]);
    expect(cards[0]!.name).toBe("Sample · Saison");
  });
  it("shows one first-brew article while retaining unrelated published topics", () => {
    const articles = ["Контроль температуры брожения", "Первая варка дома: пошаговый чек-лист", "Как сварить своё первое пиво", "Плотность сусла"].map((title, id) => ({ id: String(id), title } as ContentArticleListItem));
    expect(pickHomeArticles(articles).map(item => item.id)).toEqual(["0", "1", "3"]);
  });
  it("shows different published recipes rather than three copies of one style", () => {
    const cards = [["1", "APA", "18B"], ["2", "APA", "18B"], ["3", "Saison", "25B"], ["4", "Helles", "4A"]].map(([id, name, code]) => ({ id, name, style: { code } } as PublicRecipeListItem));
    expect(pickHomeRecipes(cards).map(card => card.id)).toEqual(["1", "3", "4"]);
    expect(pickHomeRecipes(cards.slice(0, 2))).toHaveLength(2);
  });
  it("sums repeated additions before comparing availability", () => {
    const recipe = { ingredients: [20, 30].map((quantity, i) => ({ id: String(i), type: "hop", ingredientCategory: "hop", ingredientCatalogItemId: "cascade", ingredientDisplayNameRu: "Каскад", amountNormalizedQuantity: quantity, amountNormalizedUnit: "g" })) } as RecipeDetailDto;
    const lines = homeRequirements(recipe);
    expect(lines).toHaveLength(1); expect(lines[0]!.quantity).toBe(50);
    const result = homeCoverage(lines, [{ ...lines[0]!, quantity: 40 }]);
    expect(result.percent).toBe(80); expect(result.missing[0]!.quantity).toBe(10);
  });
  it("does not claim ready when rounding would hide a shortage", () => {
    const line = requirement("malt", 1000, "fermentable");
    const result = homeCoverage([line], [{ ...line, quantity: 999.9 }]);
    expect(result.percent).toBe(99); expect(result.missing).toHaveLength(1);
  });
  it("keeps different dimensions apart for the same catalog item", () => {
    const recipe = { ingredients: ["g", "item"].map(unit => ({ type: "yeast", ingredientCatalogItemId: "yeast", amountNormalizedQuantity: 1, amountNormalizedUnit: unit })) } as RecipeDetailDto;
    expect(homeRequirements(recipe)).toHaveLength(2);
  });
  it("handles empty and zero stock, and formats units without changing quantities", () => {
    expect(homeCoverage([], []).percent).toBe(0);
    expect(homeCoverage([requirement("hop", 40)], []).missing[0]!.quantity).toBe(40);
    expect(homeQuantity(4200, "g")).toBe("4,2 кг"); expect(homeQuantity(0, "g")).toBe("0 г");
  });
  it("preserves ingredient selection in the login return URL", () => {
    const next = "/app/ingredients?addSource=catalog&addId=grain";
    expect(new URL(homeLoginHref(next), "http://localhost").searchParams.get("next")).toBe(next);
  });
});
