import { describe, expect, it } from "vitest";

import {
  buildIngredientSearchParams,
  resolveIngredientPickerRowContent,
  shouldSearchIngredients,
  shouldShowIngredientEmptyState,
  shouldShowIngredientSuggestions
} from "../components/ingredients/ingredient-picker";

describe("ingredient picker state helpers", () => {
  it("searches only while the picker is explicitly open", () => {
    expect(shouldSearchIngredients({ isOpen: true, query: "Maris Otter" })).toBe(true);
    expect(shouldSearchIngredients({ isOpen: false, query: "Maris Otter" })).toBe(false);
    expect(shouldSearchIngredients({ isOpen: true, query: "   " })).toBe(false);
  });

  it("shows suggestions only for an open list with results", () => {
    expect(shouldShowIngredientSuggestions({ isOpen: true, itemsCount: 3 })).toBe(true);
    expect(shouldShowIngredientSuggestions({ isOpen: false, itemsCount: 3 })).toBe(false);
    expect(shouldShowIngredientSuggestions({ isOpen: true, itemsCount: 0 })).toBe(false);
  });

  it("does not show empty state until the search request is finished", () => {
    expect(shouldShowIngredientEmptyState({
      hasResolvedQuery: false,
      isLoading: true,
      isOpen: true,
      itemsCount: 0,
      query: "Maris"
    })).toBe(false);

    expect(shouldShowIngredientEmptyState({
      hasResolvedQuery: true,
      isLoading: false,
      isOpen: true,
      itemsCount: 0,
      query: "Maris"
    })).toBe(true);

    expect(shouldShowIngredientEmptyState({
      hasResolvedQuery: true,
      isLoading: false,
      isOpen: false,
      itemsCount: 0,
      query: "Maris Otter Pale Malt"
    })).toBe(false);
  });

  it("passes category filter to search params", () => {
    const params = buildIngredientSearchParams({ q: "cascade", category: "hop", limit: 8 });

    expect(params.get("q")).toBe("cascade");
    expect(params.get("category")).toBe("hop");
    expect(params.get("limit")).toBe("8");
  });

  it("searches across all categories when category filter is omitted", () => {
    const params = buildIngredientSearchParams({ q: "saaz", limit: 8 });

    expect(params.get("q")).toBe("saaz");
    expect(params.has("category")).toBe(false);
    expect(params.get("limit")).toBe("8");
  });

  it("promotes hop producer into the primary row and removes duplicate subtitle producer", () => {
    const view = resolveIngredientPickerRowContent({
      id: "hop-1",
      type: "hop",
      category: "hop",
      displayName: "Каскад",
      primaryLabelRu: "Каскад",
      producer: "Yakima Chief",
      countryName: "США",
      subtitle: "Yakima Chief • США • 6% AA",
      defaultUnit: "g",
      source: "catalog"
    });

    expect(view.primaryName).toBe("Каскад");
    expect(view.inlineBrand).toBe("Yakima Chief");
    expect(view.subtitle).toBe("США • 6% AA");
  });

  it("promotes malt brand into the primary row only when it is not already in the title", () => {
    const view = resolveIngredientPickerRowContent({
      id: "malt-1",
      type: "fermentable",
      category: "fermentable",
      subtype: "malt",
      displayName: "Пилснер",
      primaryLabelRu: "Пилснер",
      brand: "Курский солод",
      subtitle: "Курский солод • 3 Lovibond",
      defaultUnit: "kg",
      source: "catalog"
    });

    expect(view.inlineBrand).toBe("Курский солод");
    expect(view.subtitle).toBe("3 Lovibond");

    const alreadyIncluded = resolveIngredientPickerRowContent({
      id: "malt-2",
      type: "fermentable",
      category: "fermentable",
      subtype: "malt",
      displayName: "Староминский солод Пилснер",
      primaryLabelRu: "Староминский солод Пилснер",
      brand: "Староминский солод",
      subtitle: "Староминский солод • 3 Lovibond",
      defaultUnit: "kg",
      source: "catalog"
    });

    expect(alreadyIncluded.inlineBrand).toBeNull();
    expect(alreadyIncluded.subtitle).toBe("Староминский солод • 3 Lovibond");
  });
});
