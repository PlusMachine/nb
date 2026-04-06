import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  buildIngredientSearchParams,
  buildIngredientPickerExpandLabel,
  countIngredientPickerActiveScopes,
  countIngredientPickerRefinementCoverage,
  IngredientPicker,
  IngredientPickerCustomOnlyChip,
  IngredientPickerFamilyChip,
  IngredientPickerFavoritesChip,
  IngredientPickerLoadingState,
  ingredientPickerCollapsedRecentCount,
  ingredientPickerExpandedRecentCount,
  IngredientSelectionCard,
  IngredientPickerQuickStartPanel,
  IngredientPickerManufacturerChip,
  IngredientPickerScopeResetButton,
  ingredientPickerMaltQuickStartFamilies,
  normalizeIngredientSearchResponse,
  resolveIngredientPickerLoadingLabel,
  resolveIngredientPickerVisibleRecentItems,
  resolveIngredientPickerRowContent,
  resolveIngredientPickerRequestedLimit,
  resolveIngredientPickerSearchQuery,
  resolveIngredientPickerScopedState,
  resolveIngredientPickerScopedPlaceholder,
  resolveVisibleIngredientItems,
  shouldAllowIngredientFavoritesFilter,
  shouldAllowIngredientCustomOnlyFilter,
  shouldShowIngredientLoadingState,
  shouldShowIngredientPickerRecentExpandAction,
  shouldCloseIngredientPickerAfterBlur,
  shouldRemoveIngredientManufacturerOnBackspace,
  shouldSearchIngredients,
  shouldShowIngredientScopeReset,
  shouldShowIngredientQuickStart,
  shouldShowIngredientEmptyState,
  shouldShowIngredientSuggestions,
  shouldUseIngredientRefinementMode
} from "../components/ingredients/ingredient-picker";

const buildSuggestionItem = (overrides: Record<string, unknown> = {}) => ({
  id: "malt-1",
  type: "fermentable" as const,
  category: "fermentable" as const,
  subtype: "malt" as const,
  displayName: "Пилснер",
  primaryLabelRu: "Пилснер",
  brand: "Castle Malting",
  countryCode: "BE",
  countryName: "Бельгия",
  subtitle: "Castle Malting • Бельгия • 3 EBC",
  technicalData: {
    type: "malt" as const,
    colorLovibond: 1.5,
    extractPctDryBasis: 81
  },
  defaultUnit: "kg" as const,
  source: "catalog" as const,
  ...overrides
});

describe("ingredient picker state helpers", () => {
  it("searches only while the picker is explicitly open", () => {
    expect(shouldSearchIngredients({ isOpen: true, query: "Maris Otter" })).toBe(true);
    expect(shouldSearchIngredients({ isOpen: false, query: "Maris Otter" })).toBe(false);
    expect(shouldSearchIngredients({ isOpen: true, query: "   " })).toBe(false);
    expect(shouldSearchIngredients({ isOpen: true, query: "", hasSearchScope: true })).toBe(true);
  });

  it("shows suggestions for open lists with results or refinements", () => {
    expect(shouldShowIngredientSuggestions({ isOpen: true, itemsCount: 3 })).toBe(true);
    expect(shouldShowIngredientSuggestions({ isOpen: false, itemsCount: 3 })).toBe(false);
    expect(shouldShowIngredientSuggestions({ isOpen: true, itemsCount: 0 })).toBe(false);
    expect(shouldShowIngredientSuggestions({ isOpen: true, itemsCount: 0, refinementsCount: 2 })).toBe(true);
  });

  it("shows malt quick-start for zero-query and sub-2-char input, but hides it once real search starts", () => {
    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "fermentable",
      subtype: "malt",
      query: ""
    })).toBe(true);

    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "fermentable",
      subtype: "malt",
      query: "п"
    })).toBe(true);

    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "fermentable",
      subtype: "malt",
      query: "пи"
    })).toBe(false);

    expect(shouldSearchIngredients({ isOpen: true, query: "пи" })).toBe(true);
  });

  it("does not show quick-start for non-malt contexts or active manufacturer-scoped search", () => {
    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "hop",
      subtype: null,
      query: ""
    })).toBe(false);

    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "fermentable",
      subtype: "malt",
      query: "",
      hasExplicitSearchState: true
    })).toBe(false);

    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "fermentable",
      subtype: "malt",
      query: "",
      hasActiveManufacturer: true
    })).toBe(false);

    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "fermentable",
      subtype: "malt",
      query: "",
      hasActiveFamilyScope: true
    })).toBe(false);

    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "fermentable",
      subtype: "malt",
      query: "",
      hasActiveFavoritesScope: true
    })).toBe(false);

    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "fermentable",
      subtype: "malt",
      query: "",
      hasActiveCustomScope: true
    })).toBe(false);
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

  it("shows loading state immediately for valid search intent and uses contextual loading copy", () => {
    expect(shouldShowIngredientLoadingState({
      hasResolvedQuery: false,
      isOpen: true,
      query: "pi"
    })).toBe(true);

    expect(shouldShowIngredientLoadingState({
      hasResolvedQuery: false,
      isOpen: true,
      query: "",
      hasSearchScope: true
    })).toBe(true);

    expect(shouldShowIngredientLoadingState({
      hasResolvedQuery: true,
      isOpen: true,
      query: "pi"
    })).toBe(false);

    expect(resolveIngredientPickerLoadingLabel({
      query: "castle"
    })).toBe("Ищем совпадения...");

    expect(resolveIngredientPickerLoadingLabel({
      query: "",
      hasSearchScope: true
    })).toBe("Подбираем варианты по выбранным фильтрам...");

    const html = renderToStaticMarkup(React.createElement(IngredientPickerLoadingState, {
      label: "Ищем совпадения..."
    }));

    expect(html).toContain('data-testid="ingredient-picker-loading"');
    expect(html).toContain("Ищем совпадения...");
    expect(html).toContain("animate-spin");
  });

  it("passes category, family, manufacturer and source scopes to search params", () => {
    const params = buildIngredientSearchParams({
      q: "",
      category: "fermentable",
      subtype: "malt",
      family: "pilsner",
      manufacturer: "Castle Malting",
      favoritesOnly: true,
      customOnly: true,
      limit: 8
    });

    expect(params.get("q")).toBe("");
    expect(params.get("category")).toBe("fermentable");
    expect(params.get("subtype")).toBe("malt");
    expect(params.get("family")).toBe("pilsner");
    expect(params.get("manufacturer")).toBe("Castle Malting");
    expect(params.get("favoritesOnly")).toBe("true");
    expect(params.get("customOnly")).toBe("true");
    expect(params.get("limit")).toBe("8");
  });

  it("searches across all categories when category filter is omitted", () => {
    const params = buildIngredientSearchParams({ q: "saaz", limit: 8 });

    expect(params.get("q")).toBe("saaz");
    expect(params.has("category")).toBe(false);
    expect(params.get("limit")).toBe("8");
  });

  it("shows quick-start filters only when matching data exists", () => {
    expect(shouldAllowIngredientFavoritesFilter({
      enableQuickStart: true,
      category: "fermentable",
      subtype: "malt",
      hasFavoritesInCategory: true
    })).toBe(true);

    expect(shouldAllowIngredientFavoritesFilter({
      enableQuickStart: true,
      category: "fermentable",
      subtype: "malt",
      hasFavoritesInCategory: false
    })).toBe(false);

    expect(shouldAllowIngredientFavoritesFilter({
      enableQuickStart: false,
      category: "fermentable",
      subtype: "malt",
      hasFavoritesInCategory: true
    })).toBe(false);

    expect(shouldAllowIngredientCustomOnlyFilter({
      allowCustomOnlyFilter: true,
      includeCustom: true,
      hasCustomItemsInCategory: true
    })).toBe(true);

    expect(shouldAllowIngredientCustomOnlyFilter({
      allowCustomOnlyFilter: true,
      includeCustom: true,
      hasCustomItemsInCategory: false
    })).toBe(false);

    expect(shouldAllowIngredientCustomOnlyFilter({
      allowCustomOnlyFilter: false,
      includeCustom: true,
      hasCustomItemsInCategory: true
    })).toBe(false);
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

  it("keeps fermentable producer below the title and surfaces the fermentable kind inline", () => {
    const view = resolveIngredientPickerRowContent({
      id: "ferm-1",
      type: "fermentable",
      category: "fermentable",
      subtype: "fermentable",
      itemKind: "malt_extract",
      displayName: "Баварский пилснер",
      primaryLabelRu: "Баварский пилснер",
      producer: "Weyermann",
      countryName: "Германия",
      subtitle: "Weyermann • Германия • 12 EBC",
      technicalData: {
        type: "fermentable",
        extractForm: "liquid"
      },
      defaultUnit: "kg",
      source: "catalog"
    });

    expect(view.inlineBrand).toBeNull();
    expect(view.inlineKindLabel).toBe("Жидкий солодовый экстракт");
    expect(view.subtitle).toBe("Weyermann • 12 EBC");
  });

  it("surfaces consumable package/market match in picker rows instead of abstract canonical title", () => {
    const view = resolveIngredientPickerRowContent({
      id: "acid-sanitizer",
      type: "consumable",
      category: "consumable",
      displayName: "Санитайзер без смывания (кислотный, Star San тип)",
      primaryLabelRu: "Санитайзер без смывания (кислотный, Star San тип)",
      technicalData: {
        type: "consumable",
        pickerFunctionRu: "Кислотный no-rinse санитайзер",
        pickerUsageRu: "Финальная дезинфекция без смывания",
        marketNamesRu: ["Star San", "Brew San", "Bio San"],
        brandFamilyMode: "matched_variant_brand"
      },
      packageVariants: [{
        id: "pv-star-san-100",
        brand: "Beergineer",
        productNameEn: "Star San",
        productNameRu: "Дезинфектор Brew San",
        countryNameRu: "Россия",
        packageAmount: 100,
        packageUnit: "ml",
        stockContentAmount: 100,
        stockContentUnit: "ml",
        sourceGroup: null,
        sourceUrl: null,
        isDefaultForStock: true,
        position: 0
      }],
      matchType: "package",
      matchedPackageVariantId: "pv-star-san-100",
      matchedPackageVariantName: "Beergineer Star San",
      defaultUnit: "ml",
      source: "catalog"
    });

    expect(view.primaryName).toBe("Star San / Brew San / Bio San");
    expect(view.secondaryName).toBe("Кислотный no-rinse санитайзер");
    expect(view.country).toBeNull();
    expect(view.subtitle).toBe("Beergineer • 100 ml • Финальная дезинфекция без смывания • Beergineer Star San");
  });

  it("enables refinement mode only for broad result sets without an active scope of the same type", () => {
    expect(shouldUseIngredientRefinementMode({
      total: 14,
      refinements: [{
        type: "manufacturer",
        label: "Castle Malting",
        normalizedLabel: "castle malting",
        value: "Castle Malting",
        count: 5,
        score: 80
      }],
      activeManufacturer: null,
      activeGroup: null
    })).toBe(true);

    expect(shouldUseIngredientRefinementMode({
      total: 14,
      refinements: [{
        type: "manufacturer",
        label: "Castle Malting",
        normalizedLabel: "castle malting",
        value: "Castle Malting",
        count: 5,
        score: 80
      }],
      activeManufacturer: {
        type: "manufacturer",
        label: "Castle Malting",
        normalizedLabel: "castle malting",
        value: "Castle Malting",
        count: 5,
        score: 80
      },
      activeGroup: null
    })).toBe(false);

    expect(shouldUseIngredientRefinementMode({
      total: 6,
      refinements: [{
        type: "manufacturer",
        label: "Castle Malting",
        normalizedLabel: "castle malting",
        value: "Castle Malting",
        count: 5,
        score: 80
      }],
      activeManufacturer: null,
      activeGroup: null
    })).toBe(false);

    expect(shouldUseIngredientRefinementMode({
      total: 14,
      refinements: [{
        type: "consumable_group",
        label: "Санитайзеры",
        normalizedLabel: "sanitizer",
        value: "sanitizer",
        count: 6,
        score: 82
      }],
      activeManufacturer: null,
      activeGroup: {
        type: "consumable_group",
        label: "Санитайзеры",
        normalizedLabel: "sanitizer",
        value: "sanitizer",
        count: 6,
        score: 82
      }
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

  it("counts only visible top refinement coverage instead of pretending to cover all results", () => {
    expect(countIngredientPickerRefinementCoverage([
      { type: "manufacturer", label: "Castle Malting", normalizedLabel: "castle malting", value: "Castle Malting", count: 11, score: 80 },
      { type: "manufacturer", label: "Weyermann", normalizedLabel: "weyermann", value: "Weyermann", count: 9, score: 79 },
      { type: "manufacturer", label: "Soufflet", normalizedLabel: "soufflet", value: "Soufflet", count: 10, score: 78 }
    ])).toBe(30);
  });

  it("requests all matches on expand up to the explicit picker cap", () => {
    expect(resolveIngredientPickerRequestedLimit({
      defaultLimit: 10,
      isExpanded: false,
      total: 61
    })).toBe(10);

    expect(resolveIngredientPickerRequestedLimit({
      defaultLimit: 10,
      isExpanded: true,
      total: 61
    })).toBe(61);

    expect(resolveIngredientPickerRequestedLimit({
      defaultLimit: 10,
      isExpanded: true,
      total: 140
    })).toBe(100);
  });

  it("builds an expand label that matches the real expanded fetch behavior", () => {
    expect(buildIngredientPickerExpandLabel({ total: 61 })).toBe("Показать все результаты (61)");
    expect(buildIngredientPickerExpandLabel({ total: 140 })).toBe("Показать первые 100 из 140");
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
      value: "Yakima Chief",
      count: 4,
      score: 70
    });

    expect(result).toMatchObject({
      total: 1,
      hasMore: false,
      appliedManufacturer: {
        label: "Yakima Chief"
      },
      appliedGroup: null,
      appliedFamily: null,
      appliedFavoritesOnly: false,
      appliedCustomOnly: false
    });
  });

  it("keeps manufacturer scope separate from visible query text", () => {
    expect(resolveIngredientPickerSearchQuery({
      query: "",
      activeManufacturer: {
        type: "manufacturer",
        label: "Castle Malting",
        normalizedLabel: "castle malting",
        value: "Castle Malting",
        count: 5,
        score: 80
      }
    })).toBe("");

    expect(resolveIngredientPickerSearchQuery({
      query: "pil",
      activeManufacturer: {
        type: "manufacturer",
        label: "Castle Malting",
        normalizedLabel: "castle malting",
        value: "Castle Malting",
        count: 5,
        score: 80
      }
    })).toBe("pil");
  });

  it("keeps family scope separate from visible input text and uses it only as search context", () => {
    const activeFamily = {
      key: "pilsner",
      label: "Пилснер",
      presetQuery: "pilsner"
    };

    expect(resolveIngredientPickerSearchQuery({
      query: "",
      activeFamily
    })).toBe("pilsner");

    expect(resolveIngredientPickerSearchQuery({
      query: "castle",
      activeFamily
    })).toBe("castle");

    expect(resolveIngredientPickerScopedPlaceholder({
      placeholder: "Начните вводить название ингредиента",
      query: "",
      activeFamilyLabel: activeFamily.label
    })).toBe("Уточните внутри «Пилснер»");

    expect(resolveIngredientPickerScopedPlaceholder({
      placeholder: "Начните вводить название ингредиента",
      query: "",
      activeFavoritesOnly: true
    })).toBe("Искать среди избранных");

    expect(resolveIngredientPickerScopedPlaceholder({
      placeholder: "Начните вводить название ингредиента",
      query: "",
      activeCustomOnly: true
    })).toBe("Искать среди своих");
  });

  it("shows reset-all only when multiple scopes are active", () => {
    expect(countIngredientPickerActiveScopes({
      activeFamily: {
        key: "pilsner",
        label: "Пилснер",
        presetQuery: "pilsner"
      }
    })).toBe(1);

    expect(countIngredientPickerActiveScopes({
      activeFamily: {
        key: "pilsner",
        label: "Пилснер",
        presetQuery: "pilsner"
      },
      activeManufacturer: {
        type: "manufacturer",
        label: "Castle Malting",
        normalizedLabel: "castle malting",
        value: "Castle Malting",
        count: 5,
        score: 80
      },
      activeFavoritesOnly: true,
      activeCustomOnly: true
    })).toBe(4);

    expect(shouldShowIngredientScopeReset({ activeScopeCount: 1 })).toBe(false);
    expect(shouldShowIngredientScopeReset({ activeScopeCount: 2 })).toBe(true);
  });

  it("opens results state immediately for a brand-first quick-start action", () => {
    const brand = {
      type: "manufacturer" as const,
      label: "Castle Malting",
      normalizedLabel: "castle malting",
      value: "Castle Malting",
      count: 5,
      score: 80
    };
    const nextState = resolveIngredientPickerScopedState({
      activeScopeCount: 0,
      nextQuery: "",
      nextManufacturer: brand,
      nextFavoritesOnly: false
    });

    expect(nextState.isOpen).toBe(true);
    expect(nextState.nextScopeCount).toBe(1);
    expect(shouldSearchIngredients({
      isOpen: nextState.isOpen,
      query: "",
      hasSearchScope: nextState.nextScopeCount > 0
    })).toBe(true);
    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "fermentable",
      subtype: "malt",
      query: "",
      hasActiveManufacturer: true
    })).toBe(false);
  });

  it("opens results state immediately for a family quick-start action", () => {
    const family = {
      key: "pilsner",
      label: "Пилснер",
      presetQuery: "pilsner"
    };
    const nextState = resolveIngredientPickerScopedState({
      activeScopeCount: 0,
      nextQuery: "",
      nextFamily: family,
      nextFavoritesOnly: false
    });

    expect(nextState.isOpen).toBe(true);
    expect(nextState.nextScopeCount).toBe(1);
    expect(shouldSearchIngredients({
      isOpen: nextState.isOpen,
      query: "",
      hasSearchScope: nextState.nextScopeCount > 0
    })).toBe(true);
    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "fermentable",
      subtype: "malt",
      query: "",
      hasActiveFamilyScope: true
    })).toBe(false);
  });

  it("opens results state immediately for the favorites quick-start filter", () => {
    const nextState = resolveIngredientPickerScopedState({
      activeScopeCount: 0,
      nextQuery: "",
      nextFavoritesOnly: true
    });

    expect(nextState.isOpen).toBe(true);
    expect(nextState.nextScopeCount).toBe(1);
    expect(shouldSearchIngredients({
      isOpen: nextState.isOpen,
      query: "",
      hasSearchScope: nextState.nextScopeCount > 0
    })).toBe(true);
    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "fermentable",
      subtype: "malt",
      query: "",
      hasActiveFavoritesScope: true
    })).toBe(false);
  });

  it("opens results state immediately for the custom-only quick filter", () => {
    const nextState = resolveIngredientPickerScopedState({
      activeScopeCount: 0,
      nextQuery: "",
      nextFavoritesOnly: false,
      nextCustomOnly: true
    });

    expect(nextState.isOpen).toBe(true);
    expect(nextState.nextScopeCount).toBe(1);
    expect(shouldSearchIngredients({
      isOpen: nextState.isOpen,
      query: "",
      hasSearchScope: nextState.nextScopeCount > 0
    })).toBe(true);
    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "fermentable",
      subtype: "malt",
      query: "",
      hasActiveCustomScope: true
    })).toBe(false);
  });

  it("keeps brand, family, favorites and custom scopes composable and clears them together", () => {
    const brand = {
      type: "manufacturer" as const,
      label: "Castle Malting",
      normalizedLabel: "castle malting",
      value: "Castle Malting",
      count: 5,
      score: 80
    };
    const family = {
      key: "pilsner",
      label: "Пилснер",
      presetQuery: "pilsner"
    };

    const brandOnly = resolveIngredientPickerScopedState({
      activeScopeCount: 0,
      nextQuery: "",
      nextManufacturer: brand,
      nextFavoritesOnly: false
    });
    expect(brandOnly.nextScopeCount).toBe(1);

    const brandAndFamily = resolveIngredientPickerScopedState({
      activeScopeCount: brandOnly.nextScopeCount,
      nextQuery: "",
      nextManufacturer: brand,
      nextFamily: family,
      nextFavoritesOnly: false
    });
    expect(brandAndFamily.nextScopeCount).toBe(2);

    const brandAndFavorites = resolveIngredientPickerScopedState({
      activeScopeCount: brandOnly.nextScopeCount,
      nextQuery: "",
      nextManufacturer: brand,
      nextFavoritesOnly: true
    });
    expect(brandAndFavorites.nextScopeCount).toBe(2);

    const fullyStacked = resolveIngredientPickerScopedState({
      activeScopeCount: brandAndFamily.nextScopeCount,
      nextQuery: "",
      nextManufacturer: brand,
      nextFamily: family,
      nextFavoritesOnly: true,
      nextCustomOnly: true
    });
    expect(fullyStacked.nextScopeCount).toBe(4);
    expect(shouldShowIngredientScopeReset({ activeScopeCount: fullyStacked.nextScopeCount })).toBe(true);

    const cleared = resolveIngredientPickerScopedState({
      activeScopeCount: fullyStacked.nextScopeCount,
      nextQuery: "",
      nextManufacturer: null,
      nextFamily: null,
      nextFavoritesOnly: false,
      nextCustomOnly: false
    });
    expect(cleared.nextScopeCount).toBe(0);
    expect(cleared.isOpen).toBe(false);
    expect(cleared.suppressQuickStart).toBe(false);
  });

  it("removes the active manufacturer chip on backspace only for an empty query", () => {
    expect(shouldRemoveIngredientManufacturerOnBackspace({
      key: "Backspace",
      query: "",
      activeManufacturer: {
        type: "manufacturer",
        label: "Castle Malting",
        normalizedLabel: "castle malting",
        value: "Castle Malting",
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
        value: "Castle Malting",
        count: 5,
        score: 80
      }
    })).toBe(false);
  });

  it("does not close the picker when the window loses focus, but closes for outside focus moves", () => {
    expect(shouldCloseIngredientPickerAfterBlur({
      documentHasFocus: false,
      nextFocusedInsidePicker: false
    })).toBe(false);

    expect(shouldCloseIngredientPickerAfterBlur({
      documentHasFocus: true,
      nextFocusedInsidePicker: true
    })).toBe(false);

    expect(shouldCloseIngredientPickerAfterBlur({
      documentHasFocus: true,
      nextFocusedInsidePicker: false
    })).toBe(true);
  });

  it("renders the active manufacturer chip as a removable pill", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientPickerManufacturerChip, {
      refinement: {
        type: "manufacturer",
        label: "Castle Malting",
        normalizedLabel: "castle malting",
        value: "Castle Malting",
        count: 5,
        score: 80
      },
      onRemove: () => undefined
    }));

    expect(html).toContain("Castle Malting");
    expect(html).toContain("Убрать производителя Castle Malting");
  });

  it("renders the active family chip as a removable pill", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientPickerFamilyChip, {
      family: {
        key: "pilsner",
        label: "Пилснер",
        presetQuery: "pilsner"
      },
      onRemove: () => undefined
    }));

    expect(html).toContain("Пилснер");
    expect(html).toContain("Убрать семейство Пилснер");
  });

  it("renders the active favorites/custom chips and scope reset action", () => {
    const favoritesHtml = renderToStaticMarkup(React.createElement(IngredientPickerFavoritesChip, {
      onRemove: () => undefined
    }));
    const customOnlyHtml = renderToStaticMarkup(React.createElement(IngredientPickerCustomOnlyChip, {
      onRemove: () => undefined
    }));
    const resetHtml = renderToStaticMarkup(React.createElement(IngredientPickerScopeResetButton, {
      onClick: () => undefined
    }));

    expect(favoritesHtml).toContain("Избранные");
    expect(favoritesHtml).toContain("Убрать фильтр Избранные");
    expect(customOnlyHtml).toContain("Только свои");
    expect(customOnlyHtml).toContain("Убрать фильтр Только свои");
    expect(resetHtml).toContain("Сбросить всё");
  });

  it("renders malt quick-start panel with brand-first hierarchy and collapsed recent block", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientPickerQuickStartPanel, {
      brands: [{
        type: "manufacturer",
        label: "Castle Malting",
        normalizedLabel: "castle malting",
        value: "Castle Malting",
        count: 12,
        score: 140
      }, {
        type: "manufacturer",
        label: "Weyermann",
        normalizedLabel: "weyermann",
        value: "Weyermann",
        count: 9,
        score: 90
      }, {
        type: "manufacturer",
        label: "BESTMALZ",
        normalizedLabel: "bestmalz",
        value: "BESTMALZ",
        count: 8,
        score: 80
      }],
      recent: [buildSuggestionItem({
        id: "malt-2",
        displayName: "Венский",
        primaryLabelRu: "Венский",
        brand: "Bestmalz"
      }), buildSuggestionItem({
        id: "malt-3",
        displayName: "Пэйл эль",
        primaryLabelRu: "Пэйл эль",
        brand: "Castle Malting"
      }), buildSuggestionItem({
        id: "malt-4",
        displayName: "Munich Premium",
        primaryLabelRu: "Munich Premium",
        brand: "Weyermann"
      }), buildSuggestionItem({
        id: "malt-5",
        displayName: "Acid Malt",
        primaryLabelRu: "Acid Malt",
        brand: "Bestmalz"
      })],
      onSelectItem: () => undefined,
      onSelectBrand: () => undefined,
      onSelectFamily: () => undefined,
      onToggleFavorites: () => undefined,
      onToggleCustomOnly: () => undefined,
      showFavoritesFilter: true,
      showCustomOnlyFilter: true
    }));

    expect(html.indexOf('data-testid="ingredient-picker-quick-start-favorites"')).toBeLessThan(
      html.indexOf('data-testid="ingredient-picker-quick-start-brands"')
    );
    expect(html.indexOf('data-testid="ingredient-picker-quick-start-brands"')).toBeLessThan(
      html.indexOf('data-testid="ingredient-picker-quick-start-types"')
    );
    expect(html.indexOf('data-testid="ingredient-picker-quick-start-types"')).toBeLessThan(
      html.indexOf('data-testid="ingredient-picker-quick-start-recent"')
    );
    expect(html).toContain("По бренду");
    expect(html).toContain("Castle Malting");
    expect(html).toContain("Weyermann");
    expect(html).toContain("BESTMALZ");
    expect(html).toContain("Только избранные");
    expect(html).toContain("Только свои");
    expect(html).toContain("По типу");
    expect(html).toContain("Недавние (4)");
    expect(html).not.toContain("Для склада");
    expect(html).not.toContain("Сначала сузьте поиск");
    expect(html).not.toContain("Если знаете солодовню");
    expect(html).not.toContain("Когда бренд не важен");
    expect(html).not.toContain("Последние выбранные позиции");
    expect(html).toContain("Пилснер");
    expect(html).toContain("Пэйл эль");
    expect(html).toContain("Пшеничный");
    expect(html).toContain("Венский");
    expect(html).toContain("Мюнхенский");
    expect(html).toContain("Карамельный");
    expect(html).toContain("Жжёный");
    expect(html).toContain("Кислый");
    expect(html).toContain("★");
    expect(html.indexOf("Только избранные")).toBeLessThan(html.indexOf("Пилснер"));
    expect((html.match(/ingredient-picker-quick-start-brand-chip/g) ?? [])).toHaveLength(3);
    expect((html.match(/ingredient-picker-quick-start-type-chip/g) ?? [])).toHaveLength(8);
    expect((html.match(/ingredient-picker-quick-start-recent-item/g) ?? [])).toHaveLength(0);
    expect(html).toContain("Показать");
    expect(html).not.toContain("border-amber-200");
    expect(html).not.toContain("rgba(255,252,245");
    expect(html).not.toContain("Munich Premium");
    expect(html).not.toContain("Acid Malt");
    expect(html).not.toContain("3 EBC");
    expect(html).not.toContain("Экст-ть 81%");
    expect(html).not.toContain('data-testid="ingredient-picker-quick-start-recent-list"');
  });

  it("keeps recent history collapsed by default and expands it up to ten items", () => {
    expect(ingredientPickerCollapsedRecentCount).toBe(0);
    expect(ingredientPickerExpandedRecentCount).toBe(10);
    expect(shouldShowIngredientPickerRecentExpandAction({ recentCount: 0 })).toBe(false);
    expect(shouldShowIngredientPickerRecentExpandAction({ recentCount: 1 })).toBe(true);
    expect(shouldShowIngredientPickerRecentExpandAction({ recentCount: 4 })).toBe(true);

    const recent = Array.from({ length: 11 }, (_, index) => buildSuggestionItem({
      id: `malt-${index + 1}`,
      displayName: `Мальт ${index + 1}`,
      primaryLabelRu: `Мальт ${index + 1}`
    }));

    expect(resolveIngredientPickerVisibleRecentItems({
      recent,
      showAllRecent: false
    })).toEqual([]);

    expect(resolveIngredientPickerVisibleRecentItems({
      recent,
      showAllRecent: true
    })).toHaveLength(10);
    expect(resolveIngredientPickerVisibleRecentItems({
      recent,
      showAllRecent: true
    }).at(-1)?.id).toBe("malt-10");
  });

  it("renders the zero-query panel inside the picker for malt inventory flows", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientPicker, {
      category: "fermentable",
      subtype: "malt",
      enableQuickStart: true,
      allowCustomOnlyFilter: true,
      onSelect: () => undefined
    }));

    expect(html).toContain('value=""');
    expect(html).toContain('data-testid="ingredient-picker-quick-start-loading"');
    expect(html).toContain('data-testid="ingredient-picker-quick-start-favorites"');
    expect(html).toContain("По бренду");
    expect(html).toContain("По типу");
    expect(html).toContain("Недавние");
    expect(html).toContain("Загружаем недавние...");
    expect(html).toContain('data-testid="ingredient-picker-quick-start-recent-loading"');
  });

  it("keeps malt family chips as a separate quick-start scope instead of injecting visible text", () => {
    expect(ingredientPickerMaltQuickStartFamilies.map((family) => family.label)).toEqual([
      "Пилснер",
      "Пэйл эль",
      "Пшеничный",
      "Венский",
      "Мюнхенский",
      "Карамельный",
      "Жжёный",
      "Кислый"
    ]);

    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "fermentable",
      subtype: "malt",
      query: "",
      hasActiveFamilyScope: true
    })).toBe(false);
  });

  it("renders selected ingredient meta with brand and flag combined and without duplicated subtitle", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientSelectionCard, {
      item: {
        id: "malt-1",
        type: "fermentable",
        category: "fermentable",
        subtype: "malt",
        displayName: "Pilsen 2RW",
        primaryLabelRu: "Pilsen 2RW",
        brand: "Castle Malting",
        countryCode: "BE",
        countryName: "Бельгия",
        subtitle: "3.5 EBC • 81% extract",
        defaultUnit: "kg",
        source: "catalog"
      },
      hideTypedSummary: true,
      hideSubtitle: true,
      mergeBrandAndCountry: true,
      statusBadgeLabel: "ИЗМЕНЕННЫЙ",
      actionLabel: "Изменить ингредиент",
      onAction: () => undefined
    }));

    expect(html).toContain("Castle Malting");
    expect(html).toContain("ИЗМЕНЕННЫЙ");
    expect(html).toContain("Изменить ингредиент");
    expect(html).not.toContain("Бельгия");
    expect(html).not.toContain("81% extract");
    expect(html).not.toContain("aria-label=\"Очистить выбранный ингредиент\"");
  });

  it("keeps recent history collapsed so secondary rows do not compete with search results", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientPickerQuickStartPanel, {
      brands: [{
        type: "manufacturer",
        label: "Weyermann",
        normalizedLabel: "weyermann",
        value: "Weyermann",
        count: 6,
        score: 80
      }],
      recent: [{
        id: "ferm-quick-1",
        type: "fermentable",
        category: "fermentable",
        subtype: "fermentable",
        itemKind: "malt_extract",
        displayName: "Баварский пилснер",
        primaryLabelRu: "Баварский пилснер",
        producer: "Weyermann",
        countryCode: "DE",
        countryName: "Германия",
        subtitle: "Weyermann • Германия • 12 EBC",
        technicalData: {
          type: "fermentable",
          extractForm: "liquid"
        },
        defaultUnit: "kg",
        source: "catalog"
      }],
      onSelectItem: () => undefined,
      onSelectBrand: () => undefined,
      onSelectFamily: () => undefined,
      onToggleFavorites: () => undefined
    }));

    expect(html).toContain("Недавние (1)");
    expect(html).not.toContain("Жидкий солодовый экстракт");
    expect((html.match(/ingredient-picker-quick-start-recent-item/g) ?? [])).toHaveLength(0);
    expect(html).not.toContain('data-testid="ingredient-picker-quick-start-recent-list"');
  });

  it("keeps generic fermentable producer below the title in the selected picker card", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientSelectionCard, {
      item: {
        id: "ferm-selected-1",
        type: "fermentable",
        category: "fermentable",
        subtype: "fermentable",
        itemKind: "malt_extract",
        displayName: "Баварский пилснер",
        primaryLabelRu: "Баварский пилснер",
        producer: "Weyermann",
        countryCode: "DE",
        countryName: "Германия",
        subtitle: "Weyermann • Германия • 12 EBC",
        technicalData: {
          type: "fermentable",
          extractForm: "liquid"
        },
        defaultUnit: "kg",
        source: "catalog"
      },
      hideTypedSummary: true,
      hideSubtitle: true,
      mergeBrandAndCountry: true
    }));

    expect(html).toContain("Жидкий солодовый экстракт");
    expect(html).toContain("Weyermann");
    expect(html).toMatch(/Weyermann.*svg/);
  });
});
