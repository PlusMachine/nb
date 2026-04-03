import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  buildIngredientSearchParams,
  IngredientPickerManufacturerChip,
  normalizeIngredientSearchResponse,
  resolveIngredientPickerRowContent,
  resolveIngredientPickerSearchQuery,
  resolveVisibleIngredientItems,
  shouldRemoveIngredientManufacturerOnBackspace,
  shouldSearchIngredients,
  shouldShowIngredientEmptyState,
  shouldShowIngredientSuggestions,
  shouldUseIngredientRefinementMode
} from "../components/ingredients/ingredient-picker";

describe("ingredient picker state helpers", () => {
  it("searches only while the picker is explicitly open", () => {
    expect(shouldSearchIngredients({ isOpen: true, query: "Maris Otter" })).toBe(true);
    expect(shouldSearchIngredients({ isOpen: false, query: "Maris Otter" })).toBe(false);
    expect(shouldSearchIngredients({ isOpen: true, query: "   " })).toBe(false);
  });

  it("shows suggestions for open lists with results or refinements", () => {
    expect(shouldShowIngredientSuggestions({ isOpen: true, itemsCount: 3 })).toBe(true);
    expect(shouldShowIngredientSuggestions({ isOpen: false, itemsCount: 3 })).toBe(false);
    expect(shouldShowIngredientSuggestions({ isOpen: true, itemsCount: 0 })).toBe(false);
    expect(shouldShowIngredientSuggestions({ isOpen: true, itemsCount: 0, refinementsCount: 2 })).toBe(true);
  });

  it("does not show empty state until the search request is finished and no refinements exist", () => {
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
      isOpen: true,
      itemsCount: 0,
      refinementsCount: 3,
      query: "pils"
    })).toBe(false);
  });

  it("passes category and manufacturer filters to search params", () => {
    const params = buildIngredientSearchParams({
      q: "cascade",
      category: "hop",
      manufacturer: "Yakima Chief",
      limit: 8
    });

    expect(params.get("q")).toBe("cascade");
    expect(params.get("category")).toBe("hop");
    expect(params.get("manufacturer")).toBe("Yakima Chief");
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
    expect(view.country).toEqual({
      code: "US",
      label: "США"
    });
    expect(view.subtitle).toBe("6% AA");
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

  it("enables refinement mode only for broad result sets without an active manufacturer scope", () => {
    expect(shouldUseIngredientRefinementMode({
      total: 14,
      refinementsCount: 3,
      activeManufacturer: null
    })).toBe(true);

    expect(shouldUseIngredientRefinementMode({
      total: 14,
      refinementsCount: 3,
      activeManufacturer: {
        type: "manufacturer",
        label: "Castle Malting",
        normalizedLabel: "castle malting",
        count: 5,
        score: 80
      }
    })).toBe(false);

    expect(shouldUseIngredientRefinementMode({
      total: 6,
      refinementsCount: 3,
      activeManufacturer: null
    })).toBe(false);
  });

  it("collapses broad ingredient lists until expanded", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      id: `item-${index}`,
      type: "hop" as const,
      displayName: `Hop ${index}`,
      defaultUnit: "g" as const,
      source: "catalog" as const
    }));

    expect(resolveVisibleIngredientItems({
      items,
      isBroadMatch: true,
      isExpanded: false
    })).toHaveLength(6);

    expect(resolveVisibleIngredientItems({
      items,
      isBroadMatch: true,
      isExpanded: true
    })).toHaveLength(8);
  });

  it("normalizes flat picker responses into structured search state", () => {
    const result = normalizeIngredientSearchResponse([
      {
        id: "hop-1",
        type: "hop",
        displayName: "Citra",
        defaultUnit: "g",
        source: "catalog"
      }
    ], {
      type: "manufacturer",
      label: "Yakima Chief",
      normalizedLabel: "yakima chief",
      count: 4,
      score: 70
    });

    expect(result).toMatchObject({
      total: 1,
      hasMore: false,
      appliedManufacturer: {
        label: "Yakima Chief"
      }
    });
  });

  it("keeps searching inside the selected manufacturer even when the visible query is consumed", () => {
    expect(resolveIngredientPickerSearchQuery({
      query: "",
      activeManufacturer: {
        type: "manufacturer",
        label: "Castle Malting",
        normalizedLabel: "castle malting",
        count: 5,
        score: 80
      }
    })).toBe("Castle Malting");

    expect(resolveIngredientPickerSearchQuery({
      query: "pil",
      activeManufacturer: {
        type: "manufacturer",
        label: "Castle Malting",
        normalizedLabel: "castle malting",
        count: 5,
        score: 80
      }
    })).toBe("pil");
  });

  it("removes the active manufacturer chip on backspace only for an empty query", () => {
    expect(shouldRemoveIngredientManufacturerOnBackspace({
      key: "Backspace",
      query: "",
      activeManufacturer: {
        type: "manufacturer",
        label: "Castle Malting",
        normalizedLabel: "castle malting",
        count: 5,
        score: 80
      }
    })).toBe(true);

    expect(shouldRemoveIngredientManufacturerOnBackspace({
      key: "Backspace",
      query: "pil",
      activeManufacturer: {
        type: "manufacturer",
        label: "Castle Malting",
        normalizedLabel: "castle malting",
        count: 5,
        score: 80
      }
    })).toBe(false);
  });

  it("renders the active manufacturer chip as a removable pill", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientPickerManufacturerChip, {
      refinement: {
        type: "manufacturer",
        label: "Castle Malting",
        normalizedLabel: "castle malting",
        count: 5,
        score: 80
      },
      onRemove: () => undefined
    }));

    expect(html).toContain("Производитель");
    expect(html).toContain("Castle Malting");
    expect(html).toContain("Убрать фильтр производителя Castle Malting");
  });
});
