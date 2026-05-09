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
  "technical_additives",
  "lauter_aid",
  "spice",
  "citrus_zest",
  "herb_flower",
  "coffee_cacao",
  "wood_aging",
  "flavoring",
  "sanitizer",
  "cleaner",
  "packaging",
  "gas",
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
const fermentableNonMaltTokens = [
  "extract",
  "concentrate",
  "syrup",
  "sugar",
  "honey",
  "molasses",
  "candi",
  "dextrose",
  "glucose",
  "fructose",
  "lactose"
] as const;

const toNormalizedToken = (value: string) => value
  .trim()
  .toLowerCase()
  .replaceAll("ё", "е")
  .replace(/[\s/]+/g, "_")
  .replace(/[^a-zа-я0-9_]+/g, "")
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
    if (fermentableNonMaltTokens.some((token) => normalized.includes(token))) {
      return "fermentable";
    }

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

  if (
    normalized.includes("technical_additives")
    || normalized.includes("tech_additives")
    || normalized.includes("process")
    || normalized.startsWith("тех")
    || normalized.includes("fining")
    || normalized.includes("clarif")
    || normalized.startsWith("освет")
    || normalized.includes("nutrient")
    || normalized.startsWith("подкорм")
    || normalized.includes("питат")
    || normalized.includes("enzyme")
    || normalized.includes("enzym")
    || normalized.includes("фермент")
    || normalized.includes("antioxid")
    || normalized.startsWith("антиокс")
    || normalized.includes("defoam")
    || normalized.includes("пено")
    || normalized.includes("preserv")
    || normalized.includes("консерв")
  ) return "technical_additives";
  if (
    normalized.includes("lauter")
    || normalized.includes("filter_aid")
    || normalized.includes("rice_hull")
    || normalized.includes("rice_husk")
    || normalized.includes("husk")
    || normalized.includes("лузг")
    || normalized.includes("шелух")
    || normalized.includes("фильтр")
  ) return "lauter_aid";
  if (normalized.includes("spice") || normalized.includes("спец")) return "spice";
  if (
    normalized.includes("citrus")
    || normalized.includes("zest")
    || normalized.includes("peel")
    || normalized.includes("цедр")
    || normalized.includes("цитрус")
  ) return "citrus_zest";
  if (
    normalized.includes("herb")
    || normalized.includes("flower")
    || normalized.includes("трав")
    || normalized.includes("цвет")
    || normalized.includes("чай")
  ) return "herb_flower";
  if (
    normalized.includes("coffee")
    || normalized.includes("cacao")
    || normalized.includes("cocoa")
    || normalized.includes("кофе")
    || normalized.includes("какао")
  ) return "coffee_cacao";
  if (
    normalized.includes("wood")
    || normalized.includes("oak")
    || normalized.includes("дерев")
    || normalized.includes("дуб")
  ) return "wood_aging";
  if (
    normalized.includes("flavor")
    || normalized.includes("flavour")
    || normalized.includes("extract")
    || normalized.includes("аромат")
    || normalized.includes("экстракт")
  ) return "flavoring";
  if (normalized.includes("sanitize")) return "sanitizer";
  if (normalized.includes("clean")) return "cleaner";
  if (
    normalized.includes("package")
    || normalized.includes("bottle")
    || normalized.includes("cap")
    || normalized.includes("cork")
    || normalized.includes("tara")
    || normalized.includes("тара")
    || normalized.includes("укупор")
    || normalized.includes("крыш")
    || normalized.includes("бутыл")
  ) return "packaging";
  if (
    normalized === "gas"
    || normalized === "gases"
    || normalized === "co2"
    || normalized.includes("углекисл")
  ) return "gas";
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

  // For seeded catalog rows, the manifest already determines whether an item is
  // `malt` or generic `fermentable`. Do not let raw source tokens such as
  // `malt_extract` override that higher-level classification.
  if (input.type === "malt") {
    return "malt";
  }

  if (input.type === "fermentable") {
    return "fermentable";
  }

  const normalizedSubtype = normalizeIngredientSubtype(category, input.subtype ?? input.itemKind ?? null);
  if (normalizedSubtype) {
    return normalizedSubtype;
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
