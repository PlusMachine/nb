import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  buildIngredientSearchParams,
  buildIngredientPickerExpandLabel,
  buildIngredientPickerResultRows,
  countIngredientPickerActiveScopes,
  countIngredientPickerRefinementCoverage,
  createIngredientPickerSearchCache,
  IngredientPicker,
  IngredientPickerCustomOnlyChip,
  IngredientPickerFamilyChip,
  IngredientPickerFavoritesChip,
  IngredientPickerGroupMemberRow,
  IngredientPickerGroupRowFields,
  IngredientPickerLoadingState,
  ingredientPickerCollapsedRecentCount,
  ingredientPickerExpandedRecentCount,
  IngredientSelectionCard,
  IngredientPickerQuickStartPanel,
  IngredientPickerManufacturerChip,
  IngredientPickerResultRowFields,
  IngredientPickerScopeResetButton,
  ingredientPickerMaltQuickStartFamilies,
  normalizeIngredientSearchResponse,
  isIngredientPickerFullResultSetLoaded,
  resolveFirstIngredientPickerRescueRowKey,
  resolveIngredientPickerGroupKey,
  resolveIngredientPickerLoadingLabel,
  resolveIngredientPickerNextExpandedGroupKey,
  resolveIngredientPickerRowActivation,
  resolveIngredientPickerRowKey,
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
  shouldUseIngredientRefinementMode,
  buildIngredientPickerInventoryMetaItems,
  buildIngredientPickerTechnicalBadges
} from "../components/ingredients/ingredient-picker";
import { resolveIngredientPickerRefinementPanelTitle } from "../components/ingredients/ingredient-picker";
import { buildIngredientPickerQuickStartBrandsFromRecentSelections } from "../features/ingredients/picker-quick-start";
import type { IngredientSearchResult } from "../features/ingredients/contracts";

const buildSearchResult = (overrides: Partial<IngredientSearchResult> = {}): IngredientSearchResult => ({
  items: [],
  refinements: [],
  total: 0,
  isBroadMatch: false,
  hasMore: false,
  appliedManufacturer: null,
  appliedGroup: null,
  appliedFamily: null,
  appliedFavoritesOnly: false,
  appliedCustomOnly: false,
  ...overrides
});

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
    expect(shouldSearchIngredients({ isOpen: true, query: "", searchOnEmptyQuery: true })).toBe(true);
  });

  it("shows suggestions for open lists with results or refinements", () => {
    expect(shouldShowIngredientSuggestions({ isOpen: true, itemsCount: 3 })).toBe(true);
    expect(shouldShowIngredientSuggestions({ isOpen: false, itemsCount: 3 })).toBe(false);
    expect(shouldShowIngredientSuggestions({ isOpen: true, itemsCount: 0 })).toBe(false);
    expect(shouldShowIngredientSuggestions({ isOpen: true, itemsCount: 0, refinementsCount: 2 })).toBe(true);
  });

  it("shows fermentable quick-start for zero-query and sub-2-char input, but hides it once real search starts", () => {
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
      subtype: "fermentable",
      query: ""
    })).toBe(true);

    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "hop",
      subtype: null,
      query: ""
    })).toBe(true);

    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "yeast",
      subtype: null,
      query: ""
    })).toBe(true);

    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "water_treatment",
      subtype: null,
      query: ""
    })).toBe(true);

    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "consumable",
      subtype: null,
      query: ""
    })).toBe(true);

    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: "fermentable",
      subtype: "malt",
      query: "пи"
    })).toBe(false);

    expect(shouldSearchIngredients({ isOpen: true, query: "пи" })).toBe(true);
  });

  it("does not show quick-start for unsupported contexts or active scoped search", () => {
    expect(shouldShowIngredientQuickStart({
      enabled: true,
      category: undefined,
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
      hasResolvedQuery: false,
      isOpen: true,
      query: "",
      searchOnEmptyQuery: true
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

    expect(resolveIngredientPickerLoadingLabel({
      query: "",
      searchOnEmptyQuery: true
    })).toBe("Подбираем варианты...");

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
      subtype: "fermentable",
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

  it("keeps hop producer below the primary row and removes duplicate country", () => {
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
    expect(view.inlineBrand).toBeNull();
    expect(view.country).toEqual({
      code: "US",
      label: "США"
    });
    expect(view.subtitle).toBe("Yakima Chief • 6% AA");
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

  it("surfaces a single consumable market name without exposing aliases", () => {
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

    expect(view.primaryName).toBe("Star San");
    expect(view.secondaryName).toBe("Кислотный no-rinse санитайзер");
    expect(view.country).toBeNull();
    expect(view.subtitle).toBe("Beergineer • 100 ml");
  });

  it("keeps matched consumable aliases searchable but hidden from row labels", () => {
    const view = resolveIngredientPickerRowContent({
      id: "gelatin-fining",
      type: "consumable",
      category: "consumable",
      displayName: "Желатин пищевой для осветления",
      primaryLabelRu: "Желатин пищевой для осветления",
      technicalData: {
        type: "consumable",
        pickerFunctionRu: "Желатин пищевой для осветления",
        pickerUsageRu: "Осветление после брожения",
        marketNamesRu: ["Желатин пищевой", "gelatin fining", "gelatin"]
      },
      matchType: "alias",
      matchedAlias: "gelatin fining",
      defaultUnit: "g",
      source: "catalog"
    });

    expect(view.primaryName).toBe("Желатин пищевой");
    expect(view.secondaryName).toBe("Желатин пищевой для осветления");
    expect(view.subtitle).toBeNull();
    expect(view.primaryName).not.toContain("gelatin");
  });

  it("uses the clean display variant for consumable market names", () => {
    const view = resolveIngredientPickerRowContent({
      id: "brewtan-b",
      type: "consumable",
      category: "consumable",
      displayName: "Brewtan B / галлотанин для стабилизации",
      primaryLabelRu: "Brewtan B / галлотанин для стабилизации",
      nameEn: "Brewtan B",
      technicalData: {
        type: "consumable",
        pickerFunctionRu: "Галлотанин для стабилизации",
        pickerUsageRu: "Стабилизация в заторе и кипячении",
        marketNamesRu: ["brewtan b", "Стабилизатор Брютан Б / Brewtan B"],
        marketNamesEn: ["Brewtan B"]
      },
      matchType: "alias",
      matchedAlias: "брютан б",
      defaultUnit: "g",
      source: "catalog"
    });

    expect(view.primaryName).toBe("Brewtan B");
    expect(view.secondaryName).toBe("Галлотанин для стабилизации");
    expect(view.primaryName).not.toContain("/");
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

  it("uses category-specific copy for group refinements", () => {
    expect(resolveIngredientPickerRefinementPanelTitle({
      currentRefinementType: "consumable_group",
      category: "fermentable"
    })).toBe("Уточнить группу сбраживаемых");

    expect(resolveIngredientPickerRefinementPanelTitle({
      currentRefinementType: "consumable_group",
      category: "water_treatment"
    })).toBe("Уточнить группу водоподготовки");

    // Без broad group (пикер склада по всей категории) — нейтральный заголовок.
    expect(resolveIngredientPickerRefinementPanelTitle({
      currentRefinementType: "consumable_group",
      category: "consumable"
    })).toBe("Уточнить группу добавок и расходников");

    // Пикер мастера рецепта форсит группу добавок — там нет тары и санитайзеров.
    expect(resolveIngredientPickerRefinementPanelTitle({
      currentRefinementType: "consumable_group",
      category: "consumable",
      broadGroup: "inventory_additives"
    })).toBe("Уточнить группу добавок");

    expect(resolveIngredientPickerRefinementPanelTitle({
      currentRefinementType: "consumable_group",
      category: "consumable",
      broadGroup: "inventory_supplies"
    })).toBe("Уточнить группу расходников");

    expect(resolveIngredientPickerRefinementPanelTitle({
      currentRefinementType: "manufacturer",
      category: "water_treatment"
    })).toBe("Уточнить производителя");
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
        label: "Bestmalz",
        normalizedLabel: "bestmalz",
        value: "Bestmalz",
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
    expect(html).toContain("Bestmalz");
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

  it("renders fermentable quick-start panel with group chips instead of malt families", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientPickerQuickStartPanel, {
      brands: [],
      groups: [{
        type: "consumable_group",
        label: "Концентраты",
        normalizedLabel: "extracts_and_concentrates",
        value: "extracts_and_concentrates",
        count: 12,
        score: 140
      }, {
        type: "consumable_group",
        label: "Сахара и сиропы",
        normalizedLabel: "sugars_and_syrups",
        value: "sugars_and_syrups",
        count: 8,
        score: 90
      }],
      recent: [],
      onSelectItem: () => undefined,
      onSelectBrand: () => undefined,
      onSelectGroup: () => undefined,
      onSelectFamily: () => undefined,
      onToggleFavorites: () => undefined,
      showTypeFamilies: false
    }));

    expect(html).toContain('data-testid="ingredient-picker-quick-start-groups"');
    expect(html).toContain("По группе");
    expect(html).toContain("Концентраты");
    expect(html).toContain("Сахара и сиропы");
    expect(html).not.toContain('data-testid="ingredient-picker-quick-start-types"');
    expect((html.match(/ingredient-picker-quick-start-group-chip/g) ?? [])).toHaveLength(2);
  });

  it("treats a forced fermentable group as an external active scope", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientPicker, {
      category: "fermentable",
      subtype: "fermentable",
      value: "",
      enableQuickStart: true,
      forcedGroup: {
        type: "consumable_group",
        label: "Сахара и сиропы",
        normalizedLabel: "sugars_and_syrups",
        value: "sugars_and_syrups",
        count: 0,
        score: 0
      },
      hideForcedGroupChip: true,
      onForcedGroupClear: () => undefined,
      onSelect: () => undefined
    }));

    expect(html).toContain('placeholder="Искать внутри Сахара и сиропы"');
    expect(html).not.toContain('data-testid="ingredient-picker-quick-start"');
    expect(html).not.toContain('data-testid="ingredient-picker-group-chip"');
    expect(html).not.toContain('data-testid="ingredient-picker-clear-all-scopes"');
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
      initialQuickStartAvailability: {
        hasFavoritesAvailable: true,
        hasCustomAvailable: true
      },
      enableQuickStart: true,
      allowCustomOnlyFilter: true,
      onSelect: () => undefined
    }));

    expect(html).toContain('value=""');
    expect(html).toContain('data-testid="ingredient-picker-quick-start"');
    expect(html).toContain('data-testid="ingredient-picker-quick-start-favorites"');
    expect(html).toContain("Только избранные");
    expect(html).toContain("Только свои");
    expect(html).toContain("По бренду");
    expect(html).toContain("Castle Malting");
    expect(html).toContain("По типу");
    expect(html).toContain("Недавние");
    expect(html).toContain("Загружаем недавние...");
    expect(html).toContain('data-testid="ingredient-picker-quick-start-recent-loading"');
  });

  it("renders the zero-query panel inside the picker for hop inventory flows", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientPicker, {
      category: "hop",
      initialQuickStartData: {
        brands: [],
        recent: [],
        hasFavoritesAvailable: true,
        hasCustomAvailable: true
      },
      enableQuickStart: true,
      allowCustomOnlyFilter: true,
      onSelect: () => undefined
    }));

    expect(html).toContain('data-testid="ingredient-picker-quick-start"');
    expect(html).toContain('data-testid="ingredient-picker-quick-start-favorites"');
    expect(html).toContain("Только избранные");
    expect(html).toContain("Только свои");
    expect(html).not.toContain("По бренду");
    expect(html).not.toContain('data-testid="ingredient-picker-quick-start-types"');
    expect(html).toContain("Загружаем недавние...");
  });

  it("renders the zero-query panel inside the picker for yeast inventory flows", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientPicker, {
      category: "yeast",
      initialQuickStartData: {
        brands: [{
          type: "manufacturer",
          label: "Fermentis",
          normalizedLabel: "fermentis",
          value: "Fermentis",
          count: 12,
          score: 120
        }],
        recent: [],
        hasFavoritesAvailable: true,
        hasCustomAvailable: true
      },
      enableQuickStart: true,
      allowCustomOnlyFilter: true,
      onSelect: () => undefined
    }));

    expect(html).toContain('data-testid="ingredient-picker-quick-start"');
    expect(html).toContain('data-testid="ingredient-picker-quick-start-favorites"');
    expect(html).toContain("Только избранные");
    expect(html).toContain("Только свои");
    expect(html).toContain("По бренду");
    expect(html).toContain("Fermentis");
    expect(html).not.toContain('data-testid="ingredient-picker-quick-start-types"');
    expect(html).toContain("Загружаем недавние...");
  });

  it("renders the zero-query panel inside the picker for water treatment inventory flows", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientPicker, {
      category: "water_treatment",
      initialQuickStartData: {
        brands: [],
        groups: [{
          type: "consumable_group",
          label: "Соли",
          normalizedLabel: "salt",
          value: "salt",
          count: 6,
          score: 60
        }, {
          type: "consumable_group",
          label: "Кислоты",
          normalizedLabel: "acid",
          value: "acid",
          count: 4,
          score: 40
        }, {
          type: "consumable_group",
          label: "Щёлочи",
          normalizedLabel: "base",
          value: "base",
          count: 0,
          score: 0
        }, {
          type: "consumable_group",
          label: "Дехлорирование",
          normalizedLabel: "dechlorination",
          value: "dechlorination",
          count: 0,
          score: 0
        }, {
          type: "consumable_group",
          label: "База воды",
          normalizedLabel: "water_source",
          value: "water_source",
          count: 0,
          score: 0
        }],
        recent: [],
        hasFavoritesAvailable: true,
        hasCustomAvailable: true
      },
      enableQuickStart: true,
      allowCustomOnlyFilter: true,
      onSelect: () => undefined
    }));

    expect(html).toContain('data-testid="ingredient-picker-quick-start"');
    expect(html).toContain('data-testid="ingredient-picker-quick-start-favorites"');
    expect(html).toContain("Только избранные");
    expect(html).toContain("Только свои");
    expect(html).toContain("По группе");
    expect(html).toContain("Соли");
    expect(html).toContain("Кислоты");
    expect(html).toContain("Щёлочи");
    expect(html).toContain("Дехлорирование");
    expect(html).toContain("База воды");
    expect(html).not.toContain("По бренду");
    expect(html).toContain("Загружаем недавние...");
  });

  it("renders the zero-query panel inside the picker for consumable inventory flows", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientPicker, {
      category: "consumable",
      initialQuickStartData: {
        brands: [],
        groups: [{
          type: "consumable_group",
          label: "Санитайзеры",
          normalizedLabel: "sanitizer",
          value: "sanitizer",
          count: 5,
          score: 50
        }, {
          type: "consumable_group",
          label: "Мойка",
          normalizedLabel: "cleaner",
          value: "cleaner",
          count: 0,
          score: 0
        }, {
          type: "consumable_group",
          label: "Техдобавки",
          normalizedLabel: "technical_additives",
          value: "technical_additives",
          count: 0,
          score: 0
        }, {
          type: "consumable_group",
          label: "Фильтрация затора",
          normalizedLabel: "lauter_aid",
          value: "lauter_aid",
          count: 0,
          score: 0
        }, {
          type: "consumable_group",
          label: "Специи",
          normalizedLabel: "spice",
          value: "spice",
          count: 0,
          score: 0
        }, {
          type: "consumable_group",
          label: "Цедра и цитрус",
          normalizedLabel: "citrus_zest",
          value: "citrus_zest",
          count: 0,
          score: 0
        }, {
          type: "consumable_group",
          label: "Тара и укупорка",
          normalizedLabel: "packaging",
          value: "packaging",
          count: 3,
          score: 30
        }, {
          type: "consumable_group",
          label: "Газы",
          normalizedLabel: "gas",
          value: "gas",
          count: 0,
          score: 0
        }],
        recent: [],
        hasFavoritesAvailable: true,
        hasCustomAvailable: true
      },
      enableQuickStart: true,
      allowCustomOnlyFilter: true,
      onSelect: () => undefined
    }));

    expect(html).toContain('data-testid="ingredient-picker-quick-start"');
    expect(html).toContain('data-testid="ingredient-picker-quick-start-favorites"');
    expect(html).toContain("Только избранные");
    expect(html).toContain("Только свои");
    expect(html).toContain("По группе");
    expect(html).toContain("Санитайзеры");
    expect(html).toContain("Мойка");
    expect(html).toContain("Техдобавки");
    expect(html).toContain("Фильтрация затора");
    expect(html).toContain("Специи");
    expect(html).toContain("Цедра и цитрус");
    expect(html).toContain("Тара и укупорка");
    expect(html).toContain("Газы");
    expect(html).not.toContain("По бренду");
    expect(html).toContain("Загружаем недавние...");
  });

  it("seeds brand chips from recent history before remote quick-start data finishes loading", () => {
    const brands = buildIngredientPickerQuickStartBrandsFromRecentSelections({
      selections: [{
        source: "catalog",
        id: "malt-2",
        category: "fermentable",
        subtype: "malt",
        brandLabel: "Bestmalz",
        selectedAt: new Date("2026-04-07T09:00:00.000Z").toISOString()
      }],
      category: "fermentable",
      subtype: "malt"
    });

    expect(brands[0]).toMatchObject({
      label: "Bestmalz",
      normalizedLabel: "bestmalz",
      value: "Bestmalz"
    });
    expect(brands[1]?.label).toBe("Курский солод");
  });

  it("does not seed brand chips from recent history for hop quick-start", () => {
    const brands = buildIngredientPickerQuickStartBrandsFromRecentSelections({
      selections: [{
        source: "catalog",
        id: "hop-2",
        category: "hop",
        subtype: "hop",
        brandLabel: "Цук",
        selectedAt: new Date("2026-04-07T09:00:00.000Z").toISOString()
      }],
      category: "hop",
      subtype: null
    });

    expect(brands).toEqual([]);
  });

  it("seeds yeast brand chips from recent history without malt fallback brands", () => {
    const brands = buildIngredientPickerQuickStartBrandsFromRecentSelections({
      selections: [{
        source: "catalog",
        id: "yeast-1",
        category: "yeast",
        subtype: "yeast",
        brandLabel: "Lallemand",
        selectedAt: new Date("2026-04-07T09:00:00.000Z").toISOString()
      }],
      category: "yeast",
      subtype: null
    });

    expect(brands).toEqual([{
      type: "manufacturer",
      label: "Lallemand",
      normalizedLabel: "lallemand",
      value: "Lallemand",
      count: 0,
      score: 0
    }]);
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

  it("keeps water treatment formulas visible in selected catalog cards when typed summary is hidden", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientSelectionCard, {
      item: {
        id: "gypsum",
        type: "water_treatment",
        category: "water_treatment",
        subtype: "salt",
        displayName: "Гипс",
        primaryLabelRu: "Гипс",
        subtitle: "Минеральная соль",
        technicalData: {
          type: "water_treatment",
          formula: "CaSO4",
          calculationFormula: "CaSO4·2H2O",
          unitPreferred: "g"
        },
        defaultUnit: "g",
        source: "catalog"
      },
      hideTypedSummary: true,
      hideSubtitle: true,
      mergeBrandAndCountry: true
    }));

    expect(html).toContain("Гипс");
    expect(html).toContain("CaSO4");
    expect(html).not.toContain("Минеральная соль");
  });

  it("builds picker badges for hop alpha acid and keeps hop brand below the title", () => {
    const item = {
      id: "hop-1",
      type: "hop" as const,
      category: "hop" as const,
      subtype: "hop" as const,
      displayName: "Citra",
      primaryLabelRu: "Citra",
      brand: "Yakima Chief",
      countryCode: "US",
      countryName: "США",
      subtitle: "Yakima Chief • США • 12.5% AA • Гранулы",
      technicalData: {
        type: "hop" as const,
        alphaAcidPctTypical: 12.5,
        hopForm: "pellet"
      },
      defaultUnit: "g" as const,
      source: "catalog" as const
    };

    expect(buildIngredientPickerTechnicalBadges(item).map((badge) => badge.label)).toEqual([
      "Альфа 12.5%",
      "Гранулы"
    ]);

    const view = resolveIngredientPickerRowContent(item);
    expect(view.inlineBrand).toBeNull();
    expect(view.subtitle).toBe("Yakima Chief • 12.5% AA • Гранулы");

    const html = renderToStaticMarkup(React.createElement(IngredientSelectionCard, {
      item
    }));

    expect(html).toContain("Альфа 12.5%");
    expect(html).toContain("Гранулы");
    expect(html).toContain("Yakima Chief");
  });

  it("translates the yeast form in picker badges instead of passing it through raw", () => {
    const item = {
      id: "yeast-1",
      type: "yeast" as const,
      category: "yeast" as const,
      subtype: "yeast" as const,
      displayName: "WLP001",
      primaryLabelRu: "WLP001",
      technicalData: {
        type: "yeast" as const,
        form: "liquid",
        attenuationPctTypical: 75
      },
      defaultUnit: "ml" as const,
      source: "catalog" as const
    };

    expect(buildIngredientPickerTechnicalBadges(item).map((badge) => badge.label)).toEqual([
      "жидкие",
      "Атт. 75%"
    ]);
  });

  it("renders malt picker badges with the same EBC accent treatment as inventory cards", () => {
    const item = buildSuggestionItem({
      technicalData: {
        type: "malt",
        colorEbcMin: 5,
        colorEbcMax: 8,
        extractPctDryBasis: 80
      }
    });

    const badges = buildIngredientPickerTechnicalBadges(item);

    expect(badges.map((badge) => badge.label)).toEqual([
      "5-8 EBC",
      "Экст-ть 80%"
    ]);
    expect(badges[0]?.accent).toMatchObject({
      startHex: expect.any(String),
      averageHex: expect.any(String),
      endHex: expect.any(String)
    });
  });

  it("renders EBC accent for non-malt fermentables when color is available", () => {
    const item = buildSuggestionItem({
      subtype: "fermentable",
      technicalData: {
        type: "fermentable",
        colorEbcMin: 12,
        colorEbcMax: 12,
        extractPctDryBasis: 79
      }
    });

    const badges = buildIngredientPickerTechnicalBadges(item);

    expect(badges.map((badge) => badge.label)).toEqual([
      "12 EBC",
      "Экст-ть 79%"
    ]);
    expect(badges[0]?.accent).toMatchObject({
      startHex: expect.any(String),
      averageHex: expect.any(String),
      endHex: expect.any(String)
    });
  });

  it("renders water treatment formula badges in the picker", () => {
    const item = buildSuggestionItem({
      id: "gypsum",
      type: "water_treatment",
      category: "water_treatment",
      subtype: "salt",
      displayName: "Гипс",
      primaryLabelRu: "Гипс",
      technicalData: {
        type: "water_treatment",
        formula: "CaSO4",
        calculationFormula: "CaSO4·2H2O",
        unitPreferred: "g"
      },
      defaultUnit: "g"
    });

    expect(buildIngredientPickerTechnicalBadges(item).map((badge) => badge.label)).toEqual([
      "CaSO4"
    ]);
  });

  it("localizes consumable picker badges and keeps dosage hints out of row subtitles", () => {
    const item = {
      id: "rice-hulls",
      type: "consumable" as const,
      category: "consumable" as const,
      displayName: "Рисовая лузга",
      primaryLabelRu: "Рисовая лузга",
      technicalData: {
        type: "consumable" as const,
        commonForms: ["husk"],
        usageStage: ["mash"],
        pickerFunctionRu: "Фильтрующая добавка",
        pickerUsageRu: "Обычно до 5% от засыпи; не дробить.",
        pickerGroup: "lauter_aid",
        marketNamesRu: ["Рисовая лузга"]
      },
      defaultUnit: "g" as const,
      source: "catalog" as const
    };

    expect(buildIngredientPickerTechnicalBadges(item).map((badge) => badge.label)).toEqual([
      "Лузга",
      "Затор"
    ]);

    expect(resolveIngredientPickerRowContent(item).subtitle).toBeNull();
  });

  it("hides generic consumable brands while keeping useful package sizes", () => {
    const view = resolveIngredientPickerRowContent({
      id: "paa",
      type: "consumable",
      category: "consumable",
      displayName: "PAA",
      primaryLabelRu: "PAA",
      technicalData: {
        type: "consumable",
        pickerFunctionRu: "Профессиональный санитайзер для CIP",
        pickerUsageRu: "Санитация и CIP",
        marketNamesRu: ["PAA"],
        pickerGroup: "sanitizer"
      },
      packageVariants: [{
        id: "pv-paa-1l",
        brand: "Generic",
        productNameEn: "PAA",
        productNameRu: null,
        countryNameRu: null,
        packageAmount: 1,
        packageUnit: "l",
        stockContentAmount: 1,
        stockContentUnit: "l",
        sourceGroup: null,
        sourceUrl: null,
        isDefaultForStock: true,
        position: 0
      }],
      matchType: "package",
      matchedPackageVariantId: "pv-paa-1l",
      matchedPackageVariantName: "PAA",
      defaultUnit: "ml",
      source: "catalog"
    });

    expect(view.subtitle).toBe("1 l");
  });

  it("adds stock quantity to picker cards without replacing catalog metadata", () => {
    const view = resolveIngredientPickerRowContent({
      id: "malt-stock-1",
      type: "fermentable",
      category: "fermentable",
      subtype: "malt",
      displayName: "Pilsen 2RW",
      primaryLabelRu: "Pilsen 2RW",
      brand: "Castle Malting",
      countryCode: "BE",
      countryName: "Бельгия",
      subtitle: "Castle Malting • Бельгия • 3.5 EBC",
      defaultUnit: "kg",
      source: "catalog",
      inventoryItemId: "inv-1",
      inventoryQuantityLabel: "2.5 kg",
      inventoryPurchasePriceLabel: "10 €",
      inventoryUnitPriceLabel: "4 € / kg",
      inventoryPurchasedAt: "2026-04-01T00:00:00.000Z",
      inventoryFreshnessDate: "2099-12-01T00:00:00.000Z",
      inventoryNotes: "Открытый пакет хранится в контейнере"
    });

    expect(view.inlineBrand).toBe("Castle Malting");
    expect(view.subtitle).toBe("3.5 EBC");
    expect(view.stockLabel).toBe("Остаток: 2.5 kg");
    expect(buildIngredientPickerInventoryMetaItems({
      id: "malt-stock-1",
      type: "fermentable",
      category: "fermentable",
      subtype: "malt",
      displayName: "Pilsen 2RW",
      primaryLabelRu: "Pilsen 2RW",
      defaultUnit: "kg",
      source: "catalog",
      inventoryPurchasePriceLabel: "10 €",
      inventoryUnitPriceLabel: "4 € / kg",
      inventoryPurchasedAt: "2026-04-01T00:00:00.000Z",
      inventoryFreshnessDate: "2099-12-01T00:00:00.000Z",
      inventoryNotes: "Открытый пакет хранится в контейнере"
    })).toEqual([
      "Покупка 10 €",
      "4 € / kg",
      "Куплен 01.04.2026",
      "Годен до 01.12.2099",
      "Заметка: Открытый пакет хранится в контейнере"
    ]);

    const html = renderToStaticMarkup(React.createElement(IngredientSelectionCard, {
      item: {
        id: "malt-stock-1",
        type: "fermentable",
        category: "fermentable",
        subtype: "malt",
        displayName: "Pilsen 2RW",
        primaryLabelRu: "Pilsen 2RW",
        brand: "Castle Malting",
        countryCode: "BE",
        countryName: "Бельгия",
        subtitle: "Castle Malting • Бельгия • 3.5 EBC",
        defaultUnit: "kg",
        source: "catalog",
        inventoryItemId: "inv-1",
        inventoryQuantityLabel: "2.5 kg",
        inventoryPurchasePriceLabel: "10 €",
        inventoryUnitPriceLabel: "4 € / kg",
        inventoryPurchasedAt: "2026-04-01T00:00:00.000Z",
        inventoryFreshnessDate: "2099-12-01T00:00:00.000Z",
        inventoryNotes: "Открытый пакет хранится в контейнере"
      }
    }));

    expect(html).toContain("Castle Malting");
    expect(html).toContain("3.5 EBC");
    expect(html).toContain("Остаток: 2.5 kg");
    expect(html).toContain("Покупка 10 €");
    expect(html).toContain("Годен до 01.12.2099");
    expect(html).toContain("Открытый пакет хранится в контейнере");
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

  it("keeps generic fermentable producer and kind together below the title in the selected picker card", () => {
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
    expect(html).toMatch(/Weyermann.*Жидкий солодовый экстракт/);
  });

  // Б4: смена источника «Склад» ↔ «Каталог» в редакторе рецепта меняет только проп
  // searchIngredients на том же экземпляре пикера — кэш результатов не должен
  // отдавать результат, закэшированный под тем же ключом другим fetcher'ом. Баг был:
  // «Пшеничный» на пустом складе кэшировался пустым результатом, и после переключения
  // на каталог тот же запрос отдавался из кэша вместо повторного похода в сеть.
  it("createIngredientPickerSearchCache сбрасывает кэш при смене fetcher'а", () => {
    const cache = createIngredientPickerSearchCache();
    const stockFetcher = () => Promise.resolve([]);
    const catalogFetcher = () => Promise.resolve([]);
    const key = "пшеничный::::::::10";

    expect(cache.get(stockFetcher, key)).toBeUndefined();
    const emptyStockResult = buildSearchResult();
    cache.set(stockFetcher, key, emptyStockResult);
    expect(cache.get(stockFetcher, key)).toBe(emptyStockResult);

    // Тот же ключ, другой fetcher — без фикса тут вернулся бы emptyStockResult
    // из кэша, и searchIngredients(catalogFetcher) ни разу бы не вызвался.
    expect(cache.get(catalogFetcher, key)).toBeUndefined();
    const catalogResult = buildSearchResult({ total: 1 });
    cache.set(catalogFetcher, key, catalogResult);
    expect(cache.get(catalogFetcher, key)).toBe(catalogResult);

    // Возврат к прежнему fetcher'у — кэш общий на «текущего» fetcher'а, а не
    // отдельный на каждого, так что старая запись склада тоже не всплывает.
    expect(cache.get(stockFetcher, key)).toBeUndefined();
  });

  it("createIngredientPickerSearchCache отдаёт результат из кэша при повторном запросе тем же fetcher'ом", () => {
    const cache = createIngredientPickerSearchCache();
    const fetcher = () => Promise.resolve([]);
    const key = "солод::::::::10";
    const result = buildSearchResult({ total: 5 });

    cache.set(fetcher, key, result);
    expect(cache.get(fetcher, key)).toBe(result);
    expect(cache.get(fetcher, key)).toBe(result);
  });
});

// Б5: группировка одноимённых записей каталога в drawer-пикере (opt-in через
// groupSameNamed на IngredientPicker, включён только в ingredient-editor.tsx
// для каталожного режима). Среда тестов — vitest environment "node" (без
// jsdom/happy-dom/react-test-renderer в зависимостях проекта), поэтому
// поведение по клику проверяется не через симуляцию DOM-событий (как в
// consume-preview-dialog.test.tsx — тот же ограничитель), а через чистые
// функции, которые обработчики компонента вызывают напрямую:
// resolveIngredientPickerRowActivation решает «раскрыть» vs «выбрать» ровно
// так же, как это делает activateRow в ingredient-picker.tsx.
describe("Б5 — группировка одноимённых записей каталога (buildIngredientPickerResultRows)", () => {
  const buildCatalogItem = (overrides: Record<string, unknown> = {}) => buildSuggestionItem({
    displayName: "Пэйл Эль",
    primaryLabelRu: "Пэйл Эль",
    category: "fermentable",
    subtype: "malt",
    source: "catalog",
    ...overrides
  });

  it("17 одноимённых каталожных записей разных производителей схлопываются в одну группу с count 17", () => {
    const items = Array.from({ length: 17 }, (_, index) => buildCatalogItem({
      id: `malt-${index}`,
      brand: `Brand ${index}`,
      countryCode: "DE",
      countryName: "Германия",
      // Реальный кейс из аудита: EBC 4.5-10.7 у разных производителей —
      // технические данные не должны участвовать в ключе группы.
      technicalData: { type: "malt", colorEbcMin: 4.5 + index * 0.3, colorEbcMax: 4.5 + index * 0.3 }
    }));

    const rows = buildIngredientPickerResultRows({ items, groupSameNamed: true });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("group");
    if (rows[0]?.kind !== "group") throw new Error("expected group row");
    expect(rows[0].items).toHaveLength(17);
    expect(rows[0].items.map((item) => item.id)).toEqual(items.map((item) => item.id));
    // Представитель — первая по текущему ранжированию запись.
    expect(rows[0].representative.id).toBe("malt-0");
  });

  it("одиночная запись остаётся обычной строкой", () => {
    const items = [buildCatalogItem({ id: "malt-solo" })];

    const rows = buildIngredientPickerResultRows({ items, groupSameNamed: true });

    expect(rows).toEqual([{ kind: "single", item: items[0] }]);
  });

  it("кастомная запись с тем же именем НЕ входит в группу каталожных", () => {
    const catalogA = buildCatalogItem({ id: "malt-a" });
    const catalogB = buildCatalogItem({ id: "malt-b" });
    const custom = buildCatalogItem({ id: "malt-custom", source: "custom" });

    const rows = buildIngredientPickerResultRows({
      items: [catalogA, custom, catalogB],
      groupSameNamed: true
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.kind).toBe("group");
    if (rows[0]?.kind !== "group") throw new Error("expected group row");
    expect(rows[0].items.map((item) => item.id)).toEqual(["malt-a", "malt-b"]);
    expect(rows[1]).toEqual({ kind: "single", item: custom });
  });

  it("разные subtype не группируются, даже при одинаковом имени и категории", () => {
    const maltItem = buildCatalogItem({ id: "malt-1", subtype: "malt" });
    const fermentableItem = buildCatalogItem({ id: "ferm-1", subtype: "fermentable" });

    const rows = buildIngredientPickerResultRows({
      items: [maltItem, fermentableItem],
      groupSameNamed: true
    });

    expect(rows).toEqual([
      { kind: "single", item: maltItem },
      { kind: "single", item: fermentableItem }
    ]);
  });

  it("без groupSameNamed (default false) — старое поведение: каждая запись своя строка, клик всегда select", () => {
    const items = Array.from({ length: 5 }, (_, index) => buildCatalogItem({ id: `malt-${index}` }));

    const rows = buildIngredientPickerResultRows({ items, groupSameNamed: false });

    expect(rows).toEqual(items.map((item) => ({ kind: "single", item })));
    for (const row of rows) {
      if (row.kind !== "single") throw new Error("expected single row");
      expect(resolveIngredientPickerRowActivation(row)).toEqual({ type: "select", item: row.item });
    }
  });

  it("resolveIngredientPickerRowActivation: группа раскрывает (не выбирает), одиночная запись выбирает", () => {
    const item = buildCatalogItem({ id: "malt-1" });
    const singleRow = { kind: "single" as const, item };
    expect(resolveIngredientPickerRowActivation(singleRow)).toEqual({ type: "select", item });

    const groupRow = {
      kind: "group" as const,
      key: resolveIngredientPickerGroupKey(item),
      items: [item],
      representative: item
    };
    expect(resolveIngredientPickerRowActivation(groupRow)).toEqual({ type: "expand", key: groupRow.key });
  });

  it("resolveIngredientPickerNextExpandedGroupKey — повторный клик по той же группе сворачивает, другая группа раскрывается", () => {
    expect(resolveIngredientPickerNextExpandedGroupKey({ currentExpandedKey: null, activatedKey: "a" })).toBe("a");
    expect(resolveIngredientPickerNextExpandedGroupKey({ currentExpandedKey: "a", activatedKey: "a" })).toBeNull();
    expect(resolveIngredientPickerNextExpandedGroupKey({ currentExpandedKey: "a", activatedKey: "b" })).toBe("b");
  });

  it("resolveIngredientPickerGroupKey игнорирует технические данные (EBC) — только имя/категория/subtype", () => {
    const a = buildCatalogItem({ id: "a", technicalData: { type: "malt", colorEbcMin: 4.5, colorEbcMax: 4.5 } });
    const b = buildCatalogItem({ id: "b", technicalData: { type: "malt", colorEbcMin: 10.7, colorEbcMax: 10.7 } });
    expect(resolveIngredientPickerGroupKey(a)).toBe(resolveIngredientPickerGroupKey(b));

    const extraPale = buildCatalogItem({ id: "c", displayName: "Экстра Пэйл Эль", primaryLabelRu: "Экстра Пэйл Эль" });
    expect(resolveIngredientPickerGroupKey(a)).not.toBe(resolveIngredientPickerGroupKey(extraPale));
  });

  it("IngredientPickerGroupMemberRow — «бренд · страна» с флагом; фолбэк на displayName без бренда/страны", () => {
    const withBrandCountry = buildCatalogItem({ id: "x", brand: "Weyermann", countryCode: "DE", countryName: "Германия" });
    const html = renderToStaticMarkup(
      React.createElement("ul", null, React.createElement(IngredientPickerGroupMemberRow, {
        item: withBrandCountry,
        onSelect: () => {}
      }))
    );
    expect(html).toContain("Weyermann · Германия");
    expect(html).toContain("svg");

    const bare = buildCatalogItem({
      id: "y",
      brand: null,
      countryCode: null,
      countryName: null,
      displayName: "Пэйл Эль (без бренда)"
    });
    const bareHtml = renderToStaticMarkup(
      React.createElement("ul", null, React.createElement(IngredientPickerGroupMemberRow, {
        item: bare,
        onSelect: () => {}
      }))
    );
    expect(bareHtml).toContain("Пэйл Эль (без бренда)");
  });

  it("IngredientPickerResultRowFields — рендерит primaryName (для одиночных строк результата)", () => {
    const html = renderToStaticMarkup(
      React.createElement(IngredientPickerResultRowFields, { item: buildCatalogItem({ id: "rep" }) })
    );
    expect(html).toContain("Пэйл Эль");
  });

  // Живой прогон: пилюля-счётчик группы врала (6/10/17 при total=17), т.к.
  // сервер отдаёт срез (limit) и порядок при равных score нестабилен между
  // запросами — считать по неполному набору нельзя.
  it("isIngredientPickerFullResultSetLoaded — число показываем только когда сервер отдал ВЕСЬ набор целиком", () => {
    expect(isIngredientPickerFullResultSetLoaded({ loadedItemsCount: 6, total: 17 })).toBe(false);
    expect(isIngredientPickerFullResultSetLoaded({ loadedItemsCount: 10, total: 17 })).toBe(false);
    expect(isIngredientPickerFullResultSetLoaded({ loadedItemsCount: 17, total: 17 })).toBe(true);
    expect(isIngredientPickerFullResultSetLoaded({ loadedItemsCount: 17, total: 10 })).toBe(true);
  });

  // Живой прогон: заголовок группы рендерился как «Пэйл Эль · Weyermann» —
  // выглядело как конкретная запись Weyermann, хотя внутри 17 производителей
  // с разными EBC/экстрактивностью. Строка-группа обязана показывать только
  // чистое имя + маркер раскрытия (всегда) + счётчик (только при полном наборе).
  it("IngredientPickerGroupRowFields — только имя и маркер/счётчик, без бренда/флага/техбейджей представителя", () => {
    const representative = buildCatalogItem({
      id: "rep",
      brand: "Weyermann",
      countryCode: "DE",
      countryName: "Германия",
      technicalData: { type: "malt", colorEbcMin: 4.5, colorEbcMax: 4.5, extractPctDryBasis: 81 }
    });
    const items = [representative, buildCatalogItem({ id: "other", brand: "Castle Malting" })];
    const row = {
      kind: "group" as const,
      key: resolveIngredientPickerGroupKey(representative),
      items,
      representative
    };

    const partialSetHtml = renderToStaticMarkup(
      React.createElement(IngredientPickerGroupRowFields, {
        row,
        isExpanded: false,
        isFullResultSetLoaded: false
      })
    );
    expect(partialSetHtml).toContain("Пэйл Эль");
    expect(partialSetHtml).not.toContain("Weyermann");
    expect(partialSetHtml).not.toContain("Германия");
    expect(partialSetHtml).not.toContain("EBC");
    expect(partialSetHtml).not.toContain("Экст-ть");
    // маркер раскрытия — всегда, даже без числа
    expect(partialSetHtml).toContain('data-testid="ingredient-picker-group-chevron"');
    expect(partialSetHtml).not.toContain('data-testid="ingredient-picker-group-count"');

    const fullSetHtml = renderToStaticMarkup(
      React.createElement(IngredientPickerGroupRowFields, {
        row,
        isExpanded: true,
        isFullResultSetLoaded: true
      })
    );
    expect(fullSetHtml).toContain('data-testid="ingredient-picker-group-count"');
    expect(fullSetHtml).toContain(`>${items.length}<`);
    expect(fullSetHtml).not.toContain("Weyermann");
    expect(fullSetHtml).not.toContain("EBC");
    // раскрыто — chevron развёрнут (rotate-180)
    expect(fullSetHtml).toContain("rotate-180");
  });
});

// С4 — rescue-выдача: ключ строки, перед которой рендерится разделитель
// «Возможно, вы имели в виду:» (см. resolveFirstIngredientPickerRescueRowKey
// в ingredient-picker.tsx).
describe("С4 — resolveFirstIngredientPickerRescueRowKey", () => {
  const buildItem = (overrides: Record<string, unknown> = {}) => buildSuggestionItem({
    id: "item-1",
    ...overrides
  });

  it("null, если ни у одной строки нет matchRescue", () => {
    const rows = [
      { kind: "single" as const, item: buildItem({ id: "a" }) },
      { kind: "single" as const, item: buildItem({ id: "b" }) }
    ];

    expect(resolveFirstIngredientPickerRescueRowKey(rows)).toBeNull();
  });

  it("ключ первой одиночной строки с matchRescue", () => {
    const exactItem = buildItem({ id: "a" });
    const rescueItem = buildItem({ id: "b", matchRescue: "fuzzy" });
    const rows = [
      { kind: "single" as const, item: exactItem },
      { kind: "single" as const, item: rescueItem }
    ];

    expect(resolveFirstIngredientPickerRescueRowKey(rows)).toBe(resolveIngredientPickerRowKey(rows[1]!));
    expect(resolveFirstIngredientPickerRescueRowKey(rows)).toBe("catalog:b");
  });

  it("для строки-группы признак берётся с representative, не с рядовых членов", () => {
    const representative = buildItem({ id: "rep", matchRescue: "scatter" });
    const member = buildItem({ id: "member" });
    const groupRow = {
      kind: "group" as const,
      key: resolveIngredientPickerGroupKey(representative),
      items: [representative, member],
      representative
    };

    expect(resolveFirstIngredientPickerRescueRowKey([groupRow])).toBe(resolveIngredientPickerRowKey(groupRow));
  });

  it("останавливается на ПЕРВОЙ rescue-строке — не на второй", () => {
    const rows = [
      { kind: "single" as const, item: buildItem({ id: "a" }) },
      { kind: "single" as const, item: buildItem({ id: "b", matchRescue: "layout" }) },
      { kind: "single" as const, item: buildItem({ id: "c", matchRescue: "layout" }) }
    ];

    expect(resolveFirstIngredientPickerRescueRowKey(rows)).toBe("catalog:b");
  });
});
