const ingredientCategories = [
  "fermentable",
  "hop",
  "yeast",
  "consumable",
  "water_treatment"
] as const;

const legacyIngredientTypes = [
  "malt",
  "fermentable",
  "hop",
  "yeast",
  "consumable",
  "water_treatment"
] as const;

const fermentableSubtypes = ["malt", "fermentable"] as const;
const hopSubtypes = ["hop"] as const;
const yeastSubtypes = ["yeast"] as const;
const consumableSubtypes = [
  "process_aid",
  "nutrient",
  "sanitizer",
  "cleaner",
  "antioxidant",
  "fining",
  "other"
] as const;
const waterTreatmentSubtypes = [
  "water_source",
  "salt",
  "acid",
  "base",
  "dechlorination",
  "other"
] as const;

const ingredientMatchPolicies = ["exact_only", "family_compatible"] as const;
const ingredientCompletenessLevels = ["minimum", "recommended", "full"] as const;
const ingredientMeasurementDimensions = ["weight", "volume", "count"] as const;
const ingredientDisplayUnits = ["g", "kg", "oz", "lb", "ml", "l", "gal", "item", "pack"] as const;

type IngredientCategory = (typeof ingredientCategories)[number];
type LegacyIngredientType = (typeof legacyIngredientTypes)[number];
type IngredientSubtype =
  | (typeof fermentableSubtypes)[number]
  | (typeof hopSubtypes)[number]
  | (typeof yeastSubtypes)[number]
  | (typeof consumableSubtypes)[number]
  | (typeof waterTreatmentSubtypes)[number];
type IngredientMatchPolicy = (typeof ingredientMatchPolicies)[number];
type IngredientCompletenessLevel = (typeof ingredientCompletenessLevels)[number];
type IngredientMeasurementDimension = (typeof ingredientMeasurementDimensions)[number];
type IngredientDisplayUnit = (typeof ingredientDisplayUnits)[number];

type ResolveIngredientTaxonomyInput = {
  category?: string | null;
  type?: string | null;
  subtype?: string | null;
  itemKind?: string | null;
  defaultDisplayUnit?: string | null;
  defaultUnit?: string | null;
  yeastForm?: string | null;
  unitPreferred?: string | null;
};

type ResolveIngredientUnitsInput = ResolveIngredientTaxonomyInput;
type ResolveIngredientCompletenessInput = Pick<ResolveIngredientTaxonomyInput, "category" | "type" | "subtype"> & {
  nameRu?: string | null;
  nameEn?: string | null;
  aliases?: string[] | null;
  brand?: string | null;
  producer?: string | null;
};

export const ingredientCategorySubtypes = {
  fermentable: fermentableSubtypes,
  hop: hopSubtypes,
  yeast: yeastSubtypes,
  consumable: consumableSubtypes,
  water_treatment: waterTreatmentSubtypes
} as const satisfies Record<IngredientCategory, readonly IngredientSubtype[]>;

const WEIGHT_UNITS: IngredientDisplayUnit[] = ["g", "kg", "oz", "lb"];
const VOLUME_UNITS: IngredientDisplayUnit[] = ["ml", "l", "gal"];
const COUNT_UNITS: IngredientDisplayUnit[] = ["item", "pack"];

const toNormalizedToken = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[\s/]+/g, "_")
  .replace(/[^a-z0-9_]+/g, "")
  .replace(/^_+|_+$/g, "");

const getKnownSubtypeSet = (category: IngredientCategory) => new Set<string>(ingredientCategorySubtypes[category]);

export const isIngredientCategory = (value: string): value is IngredientCategory => (
  (ingredientCategories as readonly string[]).includes(value)
);

export const isLegacyIngredientType = (value: string): value is LegacyIngredientType => (
  (legacyIngredientTypes as readonly string[]).includes(value)
);

export const isIngredientSubtypeForCategory = (
  category: IngredientCategory,
  value: string
): value is IngredientSubtype => getKnownSubtypeSet(category).has(value);

export const isIngredientMatchPolicy = (value: string): value is IngredientMatchPolicy => (
  (ingredientMatchPolicies as readonly string[]).includes(value)
);

export const isIngredientCompletenessLevel = (value: string): value is IngredientCompletenessLevel => (
  (ingredientCompletenessLevels as readonly string[]).includes(value)
);

export const isIngredientDisplayUnit = (value: string): value is IngredientDisplayUnit => (
  (ingredientDisplayUnits as readonly string[]).includes(value)
);

export const getIngredientMeasurementDimensionForUnit = (
  unit: IngredientDisplayUnit
): IngredientMeasurementDimension => {
  if (WEIGHT_UNITS.includes(unit)) {
    return "weight";
  }

  if (VOLUME_UNITS.includes(unit)) {
    return "volume";
  }

  return "count";
};

export const normalizeIngredientSubtype = (
  category: IngredientCategory,
  value?: string | null
): IngredientSubtype | null => {
  if (!value) {
    return null;
  }

  const normalized = toNormalizedToken(value);
  if (isIngredientSubtypeForCategory(category, normalized)) {
    return normalized;
  }

  if (category === "fermentable") {
    if (normalized.includes("malt")) {
      return "malt";
    }

    return "fermentable";
  }

  if (category === "hop") {
    return "hop";
  }

  if (category === "yeast") {
    return "yeast";
  }

  if (category === "water_treatment") {
    if (normalized.includes("water")) return "water_source";
    if (normalized.includes("acid")) return "acid";
    if (normalized.includes("salt")) return "salt";
    if (normalized.includes("base")) return "base";
    if (normalized.includes("chlor")) return "dechlorination";
    return "other";
  }

  if (normalized.includes("process")) return "process_aid";
  if (normalized.includes("nutrient")) return "nutrient";
  if (normalized.includes("sanitize")) return "sanitizer";
  if (normalized.includes("clean")) return "cleaner";
  if (normalized.includes("antioxid")) return "antioxidant";
  if (normalized.includes("fining")) return "fining";
  return "other";
};

export const resolveIngredientCategory = (input: ResolveIngredientTaxonomyInput): IngredientCategory => {
  if (input.category && isIngredientCategory(input.category)) {
    return input.category;
  }

  if (input.type && isLegacyIngredientType(input.type)) {
    if (input.type === "malt" || input.type === "fermentable") {
      return "fermentable";
    }

    if (input.type === "hop") {
      return "hop";
    }

    if (input.type === "yeast") {
      return "yeast";
    }

    if (input.type === "consumable") {
      return "consumable";
    }

    return "water_treatment";
  }

  if (input.itemKind) {
    if (normalizeIngredientSubtype("water_treatment", input.itemKind)) {
      const normalized = normalizeIngredientSubtype("water_treatment", input.itemKind);
      if (normalized && normalized !== "other") {
        return "water_treatment";
      }
    }

    if (normalizeIngredientSubtype("consumable", input.itemKind)) {
      return "consumable";
    }
  }

  return "consumable";
};

export const resolveIngredientSubtype = (input: ResolveIngredientTaxonomyInput): IngredientSubtype | null => {
  const category = resolveIngredientCategory(input);

  if (input.subtype && isIngredientSubtypeForCategory(category, input.subtype)) {
    return input.subtype;
  }

  const normalizedSubtype = normalizeIngredientSubtype(category, input.subtype ?? input.itemKind ?? null);
  if (normalizedSubtype) {
    return normalizedSubtype;
  }

  if (input.type === "malt") {
    return "malt";
  }

  if (input.type === "fermentable") {
    return "fermentable";
  }

  if (input.type === "hop") {
    return "hop";
  }

  if (input.type === "yeast") {
    return "yeast";
  }

  if (category === "water_treatment") {
    return "other";
  }

  if (category === "consumable") {
    return "other";
  }

  return null;
};

export const resolveLegacyIngredientType = (input: ResolveIngredientTaxonomyInput): LegacyIngredientType => {
  if (input.type && isLegacyIngredientType(input.type)) {
    return input.type;
  }

  const category = resolveIngredientCategory(input);
  const subtype = resolveIngredientSubtype(input);

  if (category === "fermentable") {
    return subtype === "malt" ? "malt" : "fermentable";
  }

  if (category === "hop") {
    return "hop";
  }

  if (category === "yeast") {
    return "yeast";
  }

  if (category === "water_treatment") {
    return "water_treatment";
  }

  return "consumable";
};

export const resolveIngredientMatchPolicy = (
  input: ResolveIngredientTaxonomyInput
): IngredientMatchPolicy => {
  const category = resolveIngredientCategory(input);
  return category === "hop" || category === "yeast" ? "exact_only" : "family_compatible";
};

const normalizeRequestedUnit = (
  requestedUnit?: string | null
): IngredientDisplayUnit | null => (
  requestedUnit && isIngredientDisplayUnit(requestedUnit) ? requestedUnit : null
);

const uniqueUnits = (units: readonly IngredientDisplayUnit[]) => [...new Set(units)];

export const resolveIngredientUnits = (
  input: ResolveIngredientUnitsInput
): {
  defaultDisplayUnit: IngredientDisplayUnit;
  allowedUnits: IngredientDisplayUnit[];
  measurementDimension: IngredientMeasurementDimension;
} => {
  const requestedUnit = normalizeRequestedUnit(input.defaultDisplayUnit ?? input.defaultUnit ?? input.unitPreferred ?? null);

  if (requestedUnit) {
    const measurementDimension = getIngredientMeasurementDimensionForUnit(requestedUnit);
    return {
      defaultDisplayUnit: requestedUnit,
      allowedUnits: uniqueUnits(
        measurementDimension === "weight"
          ? WEIGHT_UNITS
          : measurementDimension === "volume"
            ? VOLUME_UNITS
            : COUNT_UNITS
      ),
      measurementDimension
    };
  }

  const category = resolveIngredientCategory(input);

  if (category === "fermentable") {
    return {
      defaultDisplayUnit: "kg",
      allowedUnits: [...WEIGHT_UNITS],
      measurementDimension: "weight"
    };
  }

  if (category === "hop") {
    return {
      defaultDisplayUnit: "g",
      allowedUnits: [...WEIGHT_UNITS],
      measurementDimension: "weight"
    };
  }

  if (category === "yeast") {
    const normalizedYeastForm = String(input.yeastForm ?? "").trim().toLowerCase();
    if (normalizedYeastForm === "liquid" || normalizedYeastForm === "slurry" || normalizedYeastForm === "culture") {
      return {
        defaultDisplayUnit: "ml",
        allowedUnits: uniqueUnits(["pack", ...VOLUME_UNITS]),
        measurementDimension: "volume"
      };
    }

    return {
      defaultDisplayUnit: "g",
      allowedUnits: uniqueUnits(["pack", ...WEIGHT_UNITS]),
      measurementDimension: "weight"
    };
  }

  if (category === "water_treatment") {
    const subtype = resolveIngredientSubtype(input);
    if (subtype === "water_source") {
      return {
        defaultDisplayUnit: "l",
        allowedUnits: [...VOLUME_UNITS],
        measurementDimension: "volume"
      };
    }

    if (subtype === "acid") {
      return {
        defaultDisplayUnit: "ml",
        allowedUnits: [...VOLUME_UNITS],
        measurementDimension: "volume"
      };
    }

    return {
      defaultDisplayUnit: "g",
      allowedUnits: [...WEIGHT_UNITS],
      measurementDimension: "weight"
    };
  }

  return {
    defaultDisplayUnit: "g",
    allowedUnits: [...WEIGHT_UNITS],
    measurementDimension: "weight"
  };
};

export const resolveIngredientCompletenessLevel = (
  input: ResolveIngredientCompletenessInput
): IngredientCompletenessLevel => {
  const hasCoreName = Boolean(input.nameRu?.trim() || input.nameEn?.trim());
  if (!hasCoreName) {
    return "minimum";
  }

  const hasAliases = Boolean(input.aliases?.length);
  const hasBranding = Boolean(input.brand?.trim() || input.producer?.trim());
  return hasAliases || hasBranding ? "recommended" : "minimum";
};

export {
  ingredientCategories,
  legacyIngredientTypes,
  ingredientMatchPolicies,
  ingredientCompletenessLevels,
  ingredientMeasurementDimensions,
  ingredientDisplayUnits,
  fermentableSubtypes,
  hopSubtypes,
  yeastSubtypes,
  waterTreatmentSubtypes,
  consumableSubtypes
};

export type {
  IngredientCategory,
  LegacyIngredientType,
  IngredientSubtype,
  IngredientMatchPolicy,
  IngredientCompletenessLevel,
  IngredientMeasurementDimension,
  IngredientDisplayUnit,
  ResolveIngredientTaxonomyInput,
  ResolveIngredientUnitsInput
};
