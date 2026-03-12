import { describe, expect, it } from "vitest";

import {
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
});
