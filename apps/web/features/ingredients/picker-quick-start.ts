import type {
  IngredientCategory,
  IngredientSearchFamilyScope,
  IngredientSubtype,
  IngredientSuggestionItem,
  UserIngredientReference
} from "./contracts";
import { normalizeSearchText } from "./normalization";

export const ingredientPickerQuickStartRecentStorageKey = "nb:ingredient-picker:recent-selections";

export type IngredientPickerQuickStartFamilyKey =
  | "pilsner"
  | "pale_ale"
  | "wheat"
  | "vienna"
  | "munich"
  | "caramel"
  | "roasted"
  | "acidulated";

export type IngredientPickerMaltQuickStartFamily = {
  key: IngredientPickerQuickStartFamilyKey;
  label: string;
  presetQuery: string;
};

export const ingredientPickerMaltQuickStartFamilies: IngredientPickerMaltQuickStartFamily[] = [
  { key: "pilsner", label: "Пилснер", presetQuery: "pilsner" },
  { key: "pale_ale", label: "Пэйл эль", presetQuery: "pale ale" },
  { key: "wheat", label: "Пшеничный", presetQuery: "wheat" },
  { key: "vienna", label: "Венский", presetQuery: "vienna" },
  { key: "munich", label: "Мюнхенский", presetQuery: "munich" },
  { key: "caramel", label: "Карамельный", presetQuery: "caramel" },
  { key: "roasted", label: "Жжёный", presetQuery: "roasted" },
  { key: "acidulated", label: "Кислый", presetQuery: "acidulated" }
];

export type IngredientPickerStoredRecentSelection = {
  source: UserIngredientReference["source"];
  id: string;
  category?: IngredientCategory;
  subtype?: IngredientSubtype | null;
  selectedAt: string;
};

const buildIngredientReferenceKey = (reference: UserIngredientReference) => `${reference.source}:${reference.id}`;

const isKnownIngredientSubtype = (value: unknown): value is IngredientSubtype => (
  value === "malt"
  || value === "fermentable"
  || value === "hop"
  || value === "yeast"
  || value === "process_aid"
  || value === "nutrient"
  || value === "sanitizer"
  || value === "cleaner"
  || value === "antioxidant"
  || value === "fining"
  || value === "other"
  || value === "water_source"
  || value === "salt"
  || value === "acid"
  || value === "base"
  || value === "dechlorination"
);

export const shouldShowIngredientQuickStart = ({
  enabled,
  category,
  subtype,
  query,
  hasExplicitSearchState = false,
  hasActiveFamilyScope = false,
  hasActiveFavoritesScope = false,
  hasActiveManufacturer = false,
  hasActiveGroup = false
}: {
  enabled: boolean;
  category?: IngredientCategory;
  subtype?: IngredientSubtype | null;
  query: string;
  hasExplicitSearchState?: boolean;
  hasActiveFamilyScope?: boolean;
  hasActiveFavoritesScope?: boolean;
  hasActiveManufacturer?: boolean;
  hasActiveGroup?: boolean;
}) => (
  enabled
  && category === "fermentable"
  && subtype === "malt"
  && !hasExplicitSearchState
  && !hasActiveFamilyScope
  && !hasActiveFavoritesScope
  && !hasActiveManufacturer
  && !hasActiveGroup
  && normalizeSearchText(query).length < 2
);

export const resolveIngredientPickerQuickStartFamily = (
  key: IngredientPickerMaltQuickStartFamily["key"]
) => ingredientPickerMaltQuickStartFamilies.find((family) => family.key === key) ?? null;

export const resolveIngredientPickerQuickStartFamilyScope = (
  key?: string | null
): IngredientSearchFamilyScope | null => {
  const family = key ? resolveIngredientPickerQuickStartFamily(key as IngredientPickerMaltQuickStartFamily["key"]) : null;
  if (!family) {
    return null;
  }

  return {
    key: family.key,
    label: family.label,
    presetQuery: family.presetQuery
  };
};

export const buildIngredientPickerQuickStartFamilySearchValue = (
  key: IngredientPickerMaltQuickStartFamily["key"]
) => resolveIngredientPickerQuickStartFamily(key)?.presetQuery ?? "";

export const resolveIngredientPickerScopedPlaceholder = ({
  placeholder,
  query,
  activeManufacturerLabel,
  activeGroupLabel,
  activeFamilyLabel,
  activeFavoritesOnly = false
}: {
  placeholder: string;
  query: string;
  activeManufacturerLabel?: string | null;
  activeGroupLabel?: string | null;
  activeFamilyLabel?: string | null;
  activeFavoritesOnly?: boolean;
}) => {
  if (normalizeSearchText(query)) {
    return placeholder;
  }

  if (activeGroupLabel) {
    return `Искать внутри ${activeGroupLabel}`;
  }

  if (activeFamilyLabel) {
    return `Уточните внутри «${activeFamilyLabel}»`;
  }

  if (activeManufacturerLabel) {
    return `Искать внутри ${activeManufacturerLabel}`;
  }

  if (activeFavoritesOnly) {
    return "Искать среди избранных";
  }

  return placeholder;
};

export const sanitizeIngredientPickerStoredRecentSelections = (
  value: unknown
): IngredientPickerStoredRecentSelection[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const source = entry.source;
    const id = entry.id;
    const category = entry.category;
    const subtype = entry.subtype;
    const selectedAt = entry.selectedAt;

    if ((source !== "catalog" && source !== "custom") || typeof id !== "string" || !id.trim()) {
      return [];
    }

    const safeCategory = category === "fermentable"
      || category === "hop"
      || category === "yeast"
      || category === "water_treatment"
      || category === "consumable"
      || category === "water_prep"
      || category === "misc"
        ? category
        : undefined;
    const safeSubtype = isKnownIngredientSubtype(subtype) ? subtype : subtype == null ? null : undefined;
    const safeSelectedAt = typeof selectedAt === "string" && selectedAt.trim()
      ? selectedAt
      : new Date(0).toISOString();

    return [{
      source,
      id: id.trim(),
      category: safeCategory,
      subtype: safeSubtype,
      selectedAt: safeSelectedAt
    }];
  });
};

export const upsertIngredientPickerRecentSelections = (
  currentSelections: IngredientPickerStoredRecentSelection[],
  item: Pick<IngredientSuggestionItem, "source" | "id" | "category" | "subtype">,
  options?: {
    maxEntries?: number;
    fallbackCategory?: IngredientCategory;
    fallbackSubtype?: IngredientSubtype | null;
    selectedAt?: string;
  }
) => {
  const maxEntries = Math.max(1, options?.maxEntries ?? 12);
  const nextSelection: IngredientPickerStoredRecentSelection = {
    source: item.source,
    id: item.id,
    category: item.category ?? options?.fallbackCategory,
    subtype: item.subtype ?? options?.fallbackSubtype ?? null,
    selectedAt: options?.selectedAt ?? new Date().toISOString()
  };
  const nextKey = buildIngredientReferenceKey(nextSelection);

  return [
    nextSelection,
    ...currentSelections.filter((selection) => buildIngredientReferenceKey(selection) !== nextKey)
  ].slice(0, maxEntries);
};

export const filterIngredientPickerRecentReferencesForContext = ({
  selections,
  category,
  subtype,
  limit = 4
}: {
  selections: IngredientPickerStoredRecentSelection[];
  category?: IngredientCategory;
  subtype?: IngredientSubtype | null;
  limit?: number;
}): UserIngredientReference[] => {
  if (!category) {
    return [];
  }

  const maxEntries = Math.max(1, limit);
  const deduped = new Map<string, UserIngredientReference>();

  for (const selection of selections) {
    if (selection.category !== category) {
      continue;
    }

    if (subtype && selection.subtype !== subtype) {
      continue;
    }

    const reference = {
      source: selection.source,
      id: selection.id
    } satisfies UserIngredientReference;
    const key = buildIngredientReferenceKey(reference);
    if (!deduped.has(key)) {
      deduped.set(key, reference);
    }

    if (deduped.size >= maxEntries) {
      break;
    }
  }

  return [...deduped.values()];
};
