import type {
  IngredientCategory,
  IngredientConsumableGroupRefinement,
  IngredientManufacturerRefinement,
  IngredientSearchFamilyScope,
  IngredientSubtype,
  IngredientSuggestionItem,
  UserIngredientReference
} from "./contracts";
import {
  canonicalizeConsumablePickerGroup,
  consumablePickerGroupOrder,
  resolveConsumablePickerGroupDescription,
  resolveConsumablePickerGroupLabel
} from "./consumables";
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

export const ingredientPickerQuickStartBrandLimit = 6;
export const ingredientPickerQuickStartGroupLimit = 6;

const ingredientPickerCanonicalBrandLabels: Record<string, string> = {
  bestmalz: "Bestmalz"
};

export const resolveIngredientPickerQuickStartBrandLabel = (label?: string | null) => {
  const normalizedLabel = normalizeSearchText(label ?? "");
  if (!normalizedLabel) {
    return null;
  }

  return ingredientPickerCanonicalBrandLabels[normalizedLabel] ?? label?.trim() ?? null;
};

const buildIngredientPickerQuickStartBrand = (label: string): IngredientManufacturerRefinement => {
  const resolvedLabel = resolveIngredientPickerQuickStartBrandLabel(label) ?? label;

  return {
    type: "manufacturer",
    label: resolvedLabel,
    normalizedLabel: normalizeSearchText(resolvedLabel),
    value: resolvedLabel,
    count: 0,
    score: 0
  };
};

export const ingredientPickerMaltQuickStartFallbackBrands: IngredientManufacturerRefinement[] = [
  buildIngredientPickerQuickStartBrand("Курский солод"),
  buildIngredientPickerQuickStartBrand("Castle Malting"),
  buildIngredientPickerQuickStartBrand("Soufflet"),
  buildIngredientPickerQuickStartBrand("Weyermann"),
  buildIngredientPickerQuickStartBrand("Bestmalz"),
  buildIngredientPickerQuickStartBrand("Белсолод")
];

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

export const canonicalizeFermentableQuickStartGroup = (value?: string | null) => {
  const normalized = typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s-]+/g, "_")
    : "";
  if (!normalized) {
    return null;
  }

  if (normalized === "sugars_syrups_honey" || normalized === "sugars_and_syrups") {
    return "sugars_and_syrups";
  }

  return normalized;
};

const fermentableQuickStartGroupLabels: Record<string, string> = {
  adjunct_grains: "Зерно и несоложёнка",
  sugars_and_syrups: "Сахара и сиропы",
  fruits_and_vegetables: "Фрукты и овощи",
  extracts_and_concentrates: "Экстракты и концентраты"
};

export const ingredientPickerFermentableQuickStartGroupOrder = [
  "extracts_and_concentrates",
  "sugars_and_syrups",
  "fruits_and_vegetables",
  "adjunct_grains"
] as const;

export const resolveFermentableQuickStartGroupLabel = (value?: string | null) => {
  const normalized = canonicalizeFermentableQuickStartGroup(value);
  return normalized ? fermentableQuickStartGroupLabels[normalized] ?? value ?? null : null;
};

const buildFermentableQuickStartGroup = (value: string): IngredientConsumableGroupRefinement => ({
  type: "consumable_group",
  label: resolveFermentableQuickStartGroupLabel(value) ?? value,
  normalizedLabel: value,
  value,
  count: 0,
  score: 0
});

export const ingredientPickerFermentableQuickStartFallbackGroups: IngredientConsumableGroupRefinement[] = (
  ingredientPickerFermentableQuickStartGroupOrder.map((value) => buildFermentableQuickStartGroup(value))
);

export const canonicalizeWaterTreatmentQuickStartGroup = (value?: string | null) => {
  const normalized = typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s-]+/g, "_")
    : "";
  if (!normalized) {
    return null;
  }

  if (
    normalized === "salt"
    || normalized === "salts"
    || normalized === "соль"
    || normalized === "соли"
    || normalized.includes("chloride")
    || normalized.includes("sulfate")
    || normalized.includes("sulphate")
    || normalized.includes("gypsum")
    || normalized.includes("хлорид")
    || normalized.includes("сульфат")
    || normalized.includes("гипс")
  ) return "salt";
  if (
    normalized === "acid"
    || normalized === "acids"
    || normalized === "кислота"
    || normalized === "кислоты"
    || normalized.includes("acid")
    || normalized.includes("lactic")
    || normalized.includes("phosphoric")
    || normalized.includes("citric")
    || normalized.includes("молоч")
    || normalized.includes("фосфор")
    || normalized.includes("лимон")
  ) return "acid";
  if (
    normalized === "base"
    || normalized === "bases"
    || normalized === "alkali"
    || normalized === "alkaline"
    || normalized === "щелочь"
    || normalized === "щёлочь"
    || normalized === "щелочи"
    || normalized === "щёлочи"
    || normalized.includes("caustic")
    || normalized.includes("bicarbonate")
    || normalized.includes("carbonate")
    || normalized.includes("lye")
    || normalized.includes("щел")
    || normalized.includes("щёл")
    || normalized.includes("сода")
    || normalized.includes("бикарб")
    || normalized.includes("карбонат")
  ) return "base";
  if (
    normalized === "dechlorination"
    || normalized.includes("dechlor")
    || normalized.includes("chloramine")
    || normalized.includes("chlorine")
    || normalized.includes("campden")
    || normalized.includes("metabisulf")
    || normalized.includes("дехлор")
    || normalized.includes("обезхлор")
    || normalized.includes("кампден")
    || normalized.includes("метабис")
  ) return "dechlorination";
  if (
    normalized === "water_source"
    || normalized === "water"
    || normalized === "base_water"
    || normalized === "water_base"
    || normalized === "исходная_вода"
    || normalized === "база_воды"
    || normalized.includes("osmos")
    || normalized === "ro"
    || normalized === "ro_water"
    || normalized.includes("reverse_osmosis")
    || normalized.includes("осмос")
    || normalized.includes("дистилл")
  ) return "water_source";

  return null;
};

export const resolveWaterTreatmentQuickStartGroup = (source: {
  technicalData?: IngredientSuggestionItem["technicalData"];
  sourceCategory?: string | null;
  subcategory?: string | null;
  subtype?: string | null;
  groupName?: string | null;
  itemKind?: string | null;
}) => {
  const candidates: Array<string | null | undefined> = [
    source.sourceCategory,
    source.subcategory,
    source.subtype,
    source.groupName,
    source.itemKind
  ];

  if (source.technicalData?.type === "water_treatment") {
    const waterCalcRole = Array.isArray(source.technicalData.waterCalcRole)
      ? source.technicalData.waterCalcRole.filter((item): item is string => typeof item === "string")
      : [];
    const recommendedFor = Array.isArray(source.technicalData.recommendedFor)
      ? source.technicalData.recommendedFor.filter((item): item is string => typeof item === "string")
      : [];
    const typicalUseRu = typeof source.technicalData.typicalUseRu === "string"
      ? source.technicalData.typicalUseRu
      : null;
    const formula = typeof source.technicalData.formula === "string"
      ? source.technicalData.formula
      : null;
    candidates.push(
      ...waterCalcRole,
      ...recommendedFor,
      typicalUseRu,
      formula
    );
  }

  for (const candidate of candidates) {
    const normalized = canonicalizeWaterTreatmentQuickStartGroup(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const waterTreatmentQuickStartGroupLabels: Record<string, string> = {
  salt: "Соли",
  acid: "Кислоты",
  base: "Щёлочи",
  dechlorination: "Дехлорирование",
  water_source: "База воды"
};

export const ingredientPickerWaterTreatmentQuickStartGroupOrder = [
  "salt",
  "acid",
  "base",
  "dechlorination",
  "water_source"
] as const;

export const resolveWaterTreatmentQuickStartGroupLabel = (value?: string | null) => {
  const normalized = canonicalizeWaterTreatmentQuickStartGroup(value);
  return normalized ? waterTreatmentQuickStartGroupLabels[normalized] ?? value ?? null : null;
};

const buildWaterTreatmentQuickStartGroup = (value: string): IngredientConsumableGroupRefinement => ({
  type: "consumable_group",
  label: resolveWaterTreatmentQuickStartGroupLabel(value) ?? value,
  normalizedLabel: value,
  value,
  count: 0,
  score: 0
});

export const ingredientPickerWaterTreatmentQuickStartFallbackGroups: IngredientConsumableGroupRefinement[] = (
  ingredientPickerWaterTreatmentQuickStartGroupOrder.map((value) => buildWaterTreatmentQuickStartGroup(value))
);

const buildConsumableQuickStartGroup = (value: string): IngredientConsumableGroupRefinement => ({
  type: "consumable_group",
  label: resolveConsumablePickerGroupLabel(value) ?? value,
  normalizedLabel: value,
  value,
  count: 0,
  score: 0,
  description: resolveConsumablePickerGroupDescription(value)
});

export const ingredientPickerConsumableQuickStartFallbackGroups: IngredientConsumableGroupRefinement[] = (
  consumablePickerGroupOrder.map((value) => buildConsumableQuickStartGroup(value))
);

export const resolveIngredientPickerQuickStartGroupDisplayLimit = ({
  category,
  subtype
}: {
  category?: IngredientCategory;
  subtype?: IngredientSubtype | null;
}) => {
  const fallbackGroups = category === "fermentable" && subtype === "fermentable"
    ? ingredientPickerFermentableQuickStartFallbackGroups
    : category === "consumable"
      ? ingredientPickerConsumableQuickStartFallbackGroups
      : category === "water_treatment"
        ? ingredientPickerWaterTreatmentQuickStartFallbackGroups
        : null;

  return fallbackGroups ? fallbackGroups.length : ingredientPickerQuickStartGroupLimit;
};

export type IngredientPickerStoredRecentSelection = {
  source: UserIngredientReference["source"];
  id: string;
  category?: IngredientCategory;
  subtype?: IngredientSubtype | null;
  brandLabel?: string | null;
  groupValue?: string | null;
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
  hasActiveCustomScope = false,
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
  hasActiveCustomScope?: boolean;
  hasActiveManufacturer?: boolean;
  hasActiveGroup?: boolean;
}) => (
  enabled
  && (
    category === "hop"
    || category === "yeast"
    || category === "consumable"
    || category === "water_treatment"
    || (category === "fermentable" && (subtype === "malt" || subtype === "fermentable"))
  )
  && !hasExplicitSearchState
  && !hasActiveFamilyScope
  && !hasActiveFavoritesScope
  && !hasActiveCustomScope
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
  activeFavoritesOnly = false,
  activeCustomOnly = false
}: {
  placeholder: string;
  query: string;
  activeManufacturerLabel?: string | null;
  activeGroupLabel?: string | null;
  activeFamilyLabel?: string | null;
  activeFavoritesOnly?: boolean;
  activeCustomOnly?: boolean;
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

  if (activeCustomOnly) {
    return "Искать среди своих";
  }

  return placeholder;
};

const canonicalizeIngredientPickerStoredGroupValue = ({
  category,
  subtype,
  value
}: {
  category?: IngredientCategory;
  subtype?: IngredientSubtype | null;
  value?: string | null;
}) => {
  if (!category) {
    return null;
  }

  if (category === "fermentable" && subtype === "fermentable") {
    return canonicalizeFermentableQuickStartGroup(value);
  }

  if (category === "consumable") {
    return canonicalizeConsumablePickerGroup(value);
  }

  if (category === "water_treatment") {
    return canonicalizeWaterTreatmentQuickStartGroup(value);
  }

  return null;
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
    const brandLabel = resolveIngredientPickerQuickStartBrandLabel(
      typeof entry.brandLabel === "string" ? entry.brandLabel : null
    );
    const groupValue = canonicalizeIngredientPickerStoredGroupValue({
      category: safeCategory,
      subtype: safeSubtype,
      value: typeof entry.groupValue === "string" ? entry.groupValue : null
    });
    const safeSelectedAt = typeof selectedAt === "string" && selectedAt.trim()
      ? selectedAt
      : new Date(0).toISOString();

    return [{
      source,
      id: id.trim(),
      category: safeCategory,
      subtype: safeSubtype,
      brandLabel,
      groupValue,
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
    brandLabel?: string | null;
    groupValue?: string | null;
    selectedAt?: string;
  }
) => {
  const maxEntries = Math.max(1, options?.maxEntries ?? 12);
  const resolvedCategory = item.category ?? options?.fallbackCategory;
  const resolvedSubtype = item.subtype ?? options?.fallbackSubtype ?? null;
  const nextSelection: IngredientPickerStoredRecentSelection = {
    source: item.source,
    id: item.id,
    category: resolvedCategory,
    subtype: resolvedSubtype,
    brandLabel: resolveIngredientPickerQuickStartBrandLabel(options?.brandLabel),
    groupValue: canonicalizeIngredientPickerStoredGroupValue({
      category: resolvedCategory,
      subtype: resolvedSubtype,
      value: options?.groupValue
    }),
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

export const buildIngredientPickerQuickStartBrandsFromRecentSelections = ({
  selections,
  category,
  subtype,
  limit = ingredientPickerQuickStartBrandLimit
}: {
  selections: IngredientPickerStoredRecentSelection[];
  category?: IngredientCategory;
  subtype?: IngredientSubtype | null;
  limit?: number;
}): IngredientManufacturerRefinement[] => {
  const isMaltBrandQuickStart = category === "fermentable" && subtype === "malt";
  const isYeastBrandQuickStart = category === "yeast";

  if (!(isMaltBrandQuickStart || isYeastBrandQuickStart)) {
    return [];
  }

  const maxEntries = Math.max(1, limit);
  const selected: IngredientManufacturerRefinement[] = [];
  const seen = new Set<string>();

  for (const selection of selections) {
    if (selection.category !== category) {
      continue;
    }

    if (category === "fermentable" && selection.subtype !== subtype) {
      continue;
    }

    const label = resolveIngredientPickerQuickStartBrandLabel(selection.brandLabel);
    const normalizedLabel = normalizeSearchText(label ?? "");
    if (!label || !normalizedLabel || seen.has(normalizedLabel)) {
      continue;
    }

    selected.push({
      type: "manufacturer",
      label,
      normalizedLabel,
      value: label,
      count: 0,
      score: 0
    });
    seen.add(normalizedLabel);

    if (selected.length >= maxEntries) {
      break;
    }
  }

  if (isMaltBrandQuickStart) {
    for (const fallbackBrand of ingredientPickerMaltQuickStartFallbackBrands) {
      if (selected.length >= maxEntries) {
        break;
      }

      if (seen.has(fallbackBrand.normalizedLabel)) {
        continue;
      }

      selected.push(fallbackBrand);
      seen.add(fallbackBrand.normalizedLabel);
    }
  }

  return selected;
};

export const buildIngredientPickerQuickStartGroupsFromRecentSelections = ({
  selections,
  category,
  subtype,
  limit
}: {
  selections: IngredientPickerStoredRecentSelection[];
  category?: IngredientCategory;
  subtype?: IngredientSubtype | null;
  limit?: number;
}): IngredientConsumableGroupRefinement[] => {
  const fallbackGroups = category === "fermentable" && subtype === "fermentable"
    ? ingredientPickerFermentableQuickStartFallbackGroups
    : category === "consumable"
      ? ingredientPickerConsumableQuickStartFallbackGroups
      : category === "water_treatment"
        ? ingredientPickerWaterTreatmentQuickStartFallbackGroups
        : null;
  if (!fallbackGroups) {
    return [];
  }

  const maxEntries = Math.max(1, limit ?? resolveIngredientPickerQuickStartGroupDisplayLimit({
    category,
    subtype
  }));
  const shouldUseFixedGroupOrder = category === "consumable" || category === "water_treatment";

  if (shouldUseFixedGroupOrder) {
    return fallbackGroups.slice(0, maxEntries);
  }

  const selected: IngredientConsumableGroupRefinement[] = [];
  const seen = new Set<string>();

  for (const selection of selections) {
    if (selection.category !== category) {
      continue;
    }

    if (category === "fermentable" && selection.subtype !== subtype) {
      continue;
    }

    const value = selection.groupValue;
    if (!value || seen.has(value)) {
      continue;
    }

    const label = resolveFermentableQuickStartGroupLabel(value) ?? value;
    selected.push({
      type: "consumable_group",
      label,
      normalizedLabel: value,
      value,
      count: 0,
      score: 0,
      description: null
    });
    seen.add(value);

    if (selected.length >= maxEntries) {
      break;
    }
  }

  for (const fallbackGroup of fallbackGroups) {
    if (selected.length >= maxEntries) {
      break;
    }

    if (seen.has(fallbackGroup.value)) {
      continue;
    }

    selected.push(fallbackGroup);
    seen.add(fallbackGroup.value);
  }

  return selected;
};
