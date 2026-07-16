import { describe, expect, it } from "vitest";

import type { IngredientSuggestionItem } from "../features/ingredients/contracts";
import {
  applySelection,
  createEmptyIngredient,
  type DesignerIngredient
} from "../components/recipes/recipe-designer/helpers";

// Б6: позиция дрожжей не сохранялась без количества («Укажите количество больше
// нуля»), хотя пачки на расчёты рецепта не влияют. applySelection теперь
// подставляет видимое «1», когда единица — «пачка» и поле ещё пустое.
const dryYeastSuggestion = (overrides: Partial<IngredientSuggestionItem> = {}): IngredientSuggestionItem => ({
  id: "yeast-us05",
  type: "yeast",
  category: "yeast",
  displayName: "US-05",
  defaultUnit: "pack",
  source: "catalog",
  technicalData: { type: "yeast", form: "dry" },
  ...overrides
});

const hopSuggestion = (overrides: Partial<IngredientSuggestionItem> = {}): IngredientSuggestionItem => ({
  id: "hop-citra",
  type: "hop",
  category: "hop",
  displayName: "Citra",
  defaultUnit: "g",
  source: "catalog",
  technicalData: { type: "hop", alphaAcidPctTypical: 12 },
  ...overrides
});

describe("recipe-designer/helpers — Б6 дефолт количества «1 пачка»", () => {
  it("подставляет «1» при выборе дрожжей с пустым количеством", () => {
    const current: DesignerIngredient = createEmptyIngredient("yeast");
    expect(current.amountEnteredQuantity).toBe("");

    const result = applySelection(current, dryYeastSuggestion());

    expect(result.amountEnteredUnit).toBe("pack");
    expect(result.amountEnteredQuantity).toBe("1");
  });

  it("не перетирает уже введённое пользователем количество", () => {
    const current: DesignerIngredient = {
      ...createEmptyIngredient("yeast"),
      amountEnteredQuantity: "2"
    };

    const result = applySelection(current, dryYeastSuggestion());

    expect(result.amountEnteredUnit).toBe("pack");
    expect(result.amountEnteredQuantity).toBe("2");
  });

  it("оставляет количество пустым для ингредиента с единицей не «пачка»", () => {
    const current: DesignerIngredient = createEmptyIngredient("hop");
    expect(current.amountEnteredQuantity).toBe("");

    const result = applySelection(current, hopSuggestion());

    expect(result.amountEnteredUnit).toBe("g");
    expect(result.amountEnteredQuantity).toBe("");
  });
});
