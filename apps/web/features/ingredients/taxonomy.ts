const ingredientCategories = ["fermentable", "hop", "yeast", "water_prep", "misc"] as const;
const legacyIngredientTypes = ["fermentable", "hop", "yeast", "sugar", "adjunct", "fining", "misc"] as const;
const fermentableSubtypes = [
  "base_malt",
  "specialty_malt",
  "roasted_malt",
  "adjunct_grain",
  "extract_dry",
  "extract_liquid",
  "sugar",
  "syrup_honey",
  "fruit_fermentable"
] as const;
const hopSubtypes = ["pellet", "whole_cone", "cryo", "lupulin", "extract", "standard"] as const;
const yeastSubtypes = ["ale", "lager", "wheat", "belgian", "kveik", "wild_bacteria", "other"] as const;
const waterPrepSubtypes = ["salt", "acid", "base", "nutrient_other", "water_source", "dechlorination"] as const;
const miscSubtypes = [
  "fining",
  "antioxidant",
  "nutrient",
  "spice_herb",
  "wood",
  "flavoring",
  "enzyme",
  "cleaner",
  "sanitizer",
  "gas",
  "preservative",
  "process_aid",
  "other"
] as const;
const ingredientMatchPolicies = ["exact_only", "family_compatible"] as const;
const ingredientCompletenessLevels = ["minimum", "recommended", "full"] as const;
const ingredientMeasurementDimensions = ["weight", "volume", "count"] as const;
const ingredientDisplayUnits = ["g", "kg", "oz", "lb", "ml", "l", "gal", "item", "pack"] as const;

type IngredientCategory = (typeof ingredientCategories)[number];
type LegacyIngredientType = (typeof legacyIngredientTypes)[number];
type FermentableSubtype = (typeof fermentableSubtypes)[number];
type HopSubtype = (typeof hopSubtypes)[number];
type YeastSubtype = (typeof yeastSubtypes)[number];
type WaterPrepSubtype = (typeof waterPrepSubtypes)[number];
type MiscSubtype = (typeof miscSubtypes)[number];
type IngredientSubtype =
  | FermentableSubtype
  | HopSubtype
  | YeastSubtype
  | WaterPrepSubtype
  | MiscSubtype;
type IngredientMatchPolicy = (typeof ingredientMatchPolicies)[number];
type IngredientCompletenessLevel = (typeof ingredientCompletenessLevels)[number];
type IngredientMeasurementDimension = (typeof ingredientMeasurementDimensions)[number];
type IngredientDisplayUnit = (typeof ingredientDisplayUnits)[number];

type ResolveIngredientTaxonomyInput = {
  category?: string | null;
  type?: string | null;
  subtype?: string | null;
  displayName?: string | null;
  properties?: Record<string, unknown> | null;
  hopForm?: string | null;
  yeastType?: string | null;
  yeastForm?: string | null;
  defaultDisplayUnit?: string | null;
  defaultUnit?: string | null;
  brandName?: string | null;
  manufacturer?: string | null;
  country?: string | null;
  harvestYear?: number | null;
  description?: string | null;
  aliases?: string[] | null;
  fermentableColorEbc?: number | null;
  fermentableExtractYieldPct?: number | null;
  hopAlphaAcidPct?: number | null;
  yeastAttenuationPct?: number | null;
  completenessLevel?: string | null;
};

type ResolveIngredientUnitsInput = Pick<
  ResolveIngredientTaxonomyInput,
  "category" | "type" | "subtype" | "hopForm" | "yeastForm" | "defaultDisplayUnit" | "defaultUnit"
>;

type ResolveIngredientCompletenessInput = Pick<
  ResolveIngredientTaxonomyInput,
  | "category"
  | "type"
  | "subtype"
  | "displayName"
  | "aliases"
  | "description"
  | "brandName"
  | "manufacturer"
  | "country"
  | "harvestYear"
  | "properties"
  | "fermentableColorEbc"
  | "fermentableExtractYieldPct"
  | "hopAlphaAcidPct"
  | "yeastAttenuationPct"
  | "yeastForm"
  | "completenessLevel"
>;

export const ingredientCategorySubtypes = {
  fermentable: fermentableSubtypes,
  hop: hopSubtypes,
  yeast: yeastSubtypes,
  water_prep: waterPrepSubtypes,
  misc: miscSubtypes
} as const satisfies Record<IngredientCategory, readonly IngredientSubtype[]>;

const WEIGHT_UNITS: IngredientDisplayUnit[] = ["g", "kg", "oz", "lb"];
const VOLUME_UNITS: IngredientDisplayUnit[] = ["ml", "l", "gal"];
const COUNT_UNITS: IngredientDisplayUnit[] = ["item", "pack"];
const UNITS_BY_DIMENSION: Record<IngredientMeasurementDimension, IngredientDisplayUnit[]> = {
  weight: WEIGHT_UNITS,
  volume: VOLUME_UNITS,
  count: COUNT_UNITS
};

const FERMENTABLE_BASE_MALT_TERMS = ["pilsner", "pale malt", "vienna", "maris otter", "wheat malt", "2 row", "2-row"];
const FERMENTABLE_SPECIALTY_TERMS = ["cara", "crystal", "munich", "caramel", "melanoidin", "biscuit", "amber malt"];
const FERMENTABLE_ROASTED_TERMS = ["roasted", "chocolate", "black malt", "black patent", "roast barley"];
const FERMENTABLE_ADJUNCT_TERMS = ["flaked", "torrified", "oats", "barley", "wheat", "rye", "maize", "corn"];
const FERMENTABLE_SYRUP_TERMS = ["honey", "syrup", "molasses", "maple", "candi syrup"];
const FERMENTABLE_SUGAR_TERMS = ["sugar", "dextrose", "sucrose", "lactose", "maltodextrin"];
const FERMENTABLE_DRY_EXTRACT_TERMS = ["dme", "dry malt extract", "extract dry"];
const FERMENTABLE_LIQUID_EXTRACT_TERMS = ["lme", "liquid malt extract", "extract liquid"];
const FERMENTABLE_FRUIT_TERMS = ["fruit", "grape", "berry", "cherry", "apricot", "puree"];
const PROCESS_AID_TERMS = ["rice hulls", "rice hull", "sanitizer", "star san"];
const FLAVORING_TERMS = ["cocoa", "cacao", "peanut", "coconut", "nib", "nibs", "vanilla", "coffee"];
const WATER_SALT_TERMS = ["gypsum", "calcium chloride", "calcium sulfate", "epsom", "chloride", "sulfate", "cacl2"];
const WATER_ACID_TERMS = ["acid", "lactic", "phosphoric", "citric"];
const WATER_BASE_TERMS = ["bicarbonate", "chalk", "carbonate", "slaked lime", "pickling lime", "sodium hydroxide"];
const WATER_SOURCE_TERMS = ["reverse osmosis", "distilled water", "ro water", "osmosis water", "ro "];
const WATER_DECHLORINATION_TERMS = ["campden", "metabisulfite", "chloramine", "dechlor", "ascorbic acid"];
const WATER_PREP_STAGE_TERMS = ["water-treatment", "water treatment"];
const ANTIOXIDANT_TERMS = ["metabisulfite", "campden", "antioxidant", "sulfite"];
const NUTRIENT_TERMS = ["nutrient", "servomyces"];
const WOOD_TERMS = ["oak", "wood", "chips", "spiral"];
const SPICE_TERMS = ["spice", "pepper", "coriander", "orange peel", "cinnamon", "herb"];
const CLEANER_TERMS = ["cleaner", "caustic", "pbw", "detergent"];
const SANITIZER_TERMS = ["sanitizer", "star san", "saniclean", "iodophor"];
const GAS_TERMS = ["co2", "carbon dioxide", "gas cartridge", "cylinder"];
const PRESERVATIVE_TERMS = ["preservative", "sorbate"];

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

const toNormalizedToken = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

const normalizeDisplayName = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

const hasTerm = (value: string, terms: readonly string[]) => terms.some((term) => value.includes(term));

const readStringProperty = (properties: Record<string, unknown>, key: string) => {
  const value = properties[key];
  return typeof value === "string" ? value.trim() : "";
};

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
  const knownSubtypes = getKnownSubtypeSet(category);

  if (knownSubtypes.has(normalized)) {
    return normalized as IngredientSubtype;
  }

  if (category === "fermentable") {
    const aliases: Record<string, FermentableSubtype> = {
      base: "base_malt",
      base_malt: "base_malt",
      base_malts: "base_malt",
      specialty: "specialty_malt",
      speciality_malt: "specialty_malt",
      specialty_malt: "specialty_malt",
      crystal_malt: "specialty_malt",
      roasted_grain: "roasted_malt",
      roasted_malt: "roasted_malt",
      roast_malt: "roasted_malt",
      adjunct: "adjunct_grain",
      adjunct_grain: "adjunct_grain",
      dry_extract: "extract_dry",
      extract_dry: "extract_dry",
      liquid_extract: "extract_liquid",
      extract_liquid: "extract_liquid",
      syrup: "syrup_honey",
      honey: "syrup_honey",
      syrup_honey: "syrup_honey",
      fruit: "fruit_fermentable",
      fruit_fermentable: "fruit_fermentable"
    };

    return aliases[normalized] ?? null;
  }

  if (category === "hop") {
    const aliases: Record<string, HopSubtype> = {
      cone: "whole_cone",
      whole: "whole_cone",
      whole_cone: "whole_cone",
      wholecone: "whole_cone",
      leaf: "whole_cone",
      pellets: "pellet",
      pellet: "pellet",
      standard: "standard",
      generic: "standard"
    };

    return aliases[normalized] ?? null;
  }

  if (category === "yeast") {
    const aliases: Record<string, YeastSubtype> = {
      brett: "wild_bacteria",
      bacteria: "wild_bacteria",
      wild: "wild_bacteria",
      belgian_ale: "belgian",
      saison: "belgian"
    };

    return aliases[normalized] ?? null;
  }

  if (category === "water_prep") {
    const aliases: Record<string, WaterPrepSubtype> = {
      salts: "salt",
      mineral: "salt",
      source: "water_source",
      water_source: "water_source",
      dechlorination: "dechlorination",
      dechlorinator: "dechlorination"
    };

    return aliases[normalized] ?? null;
  }

  const miscAliases: Record<string, MiscSubtype> = {
    finings: "fining",
    anti_oxidant: "antioxidant",
    cleaner: "cleaner",
    sanitizer: "sanitizer",
    gas: "gas",
    preservative: "preservative",
    process: "process_aid",
    process_aid: "process_aid"
  };

  return miscAliases[normalized] ?? null;
};

export const resolveIngredientCategory = (input: ResolveIngredientTaxonomyInput): IngredientCategory => {
  const properties = isRecord(input.properties) ? input.properties : {};
  const taxonomyCategoryProperty = readStringProperty(properties, "taxonomyCategory");

  if (input.category && isIngredientCategory(input.category)) {
    return input.category;
  }

  if (taxonomyCategoryProperty && isIngredientCategory(taxonomyCategoryProperty)) {
    return taxonomyCategoryProperty;
  }

  const legacyType = input.type && isLegacyIngredientType(input.type) ? input.type : null;
  const displayName = normalizeDisplayName(input.displayName);
  const stage = readStringProperty(properties, "stage").toLowerCase();
  const subtypeToken = toNormalizedToken(input.subtype ?? "");

  if (legacyType === "fermentable" || legacyType === "hop" || legacyType === "yeast") {
    return legacyType;
  }

  if (legacyType === "sugar") {
    return "fermentable";
  }

  if (legacyType === "fining") {
    return "misc";
  }

  if (legacyType === "adjunct") {
    if (hasTerm(displayName, PROCESS_AID_TERMS) || subtypeToken === "process_aid") {
      return "misc";
    }

    if (hasTerm(displayName, FLAVORING_TERMS)) {
      return "misc";
    }

    return "fermentable";
  }

  if (stage && WATER_PREP_STAGE_TERMS.some((term) => stage.includes(term))) {
    return "water_prep";
  }

  if (
    hasTerm(displayName, WATER_SOURCE_TERMS)
    || hasTerm(displayName, WATER_DECHLORINATION_TERMS)
    || hasTerm(displayName, WATER_SALT_TERMS)
    || hasTerm(displayName, WATER_ACID_TERMS)
    || hasTerm(displayName, WATER_BASE_TERMS)
  ) {
    return "water_prep";
  }

  return "misc";
};

export const resolveIngredientSubtype = (input: ResolveIngredientTaxonomyInput): IngredientSubtype | null => {
  const category = resolveIngredientCategory(input);
  const normalizedSubtype = normalizeIngredientSubtype(category, input.subtype);
  if (normalizedSubtype) {
    return normalizedSubtype;
  }

  const displayName = normalizeDisplayName(input.displayName);
  const properties = isRecord(input.properties) ? input.properties : {};
  const taxonomySubtypeProperty = readStringProperty(properties, "taxonomySubtype");
  const stage = readStringProperty(properties, "stage").toLowerCase();

  if (taxonomySubtypeProperty) {
    const subtypeFromProperties = normalizeIngredientSubtype(category, taxonomySubtypeProperty);
    if (subtypeFromProperties) {
      return subtypeFromProperties;
    }
  }

  if (category === "fermentable") {
    if (input.type === "sugar" || hasTerm(displayName, FERMENTABLE_SUGAR_TERMS)) {
      return hasTerm(displayName, FERMENTABLE_SYRUP_TERMS) ? "syrup_honey" : "sugar";
    }

    if (hasTerm(displayName, FERMENTABLE_DRY_EXTRACT_TERMS)) {
      return "extract_dry";
    }

    if (hasTerm(displayName, FERMENTABLE_LIQUID_EXTRACT_TERMS)) {
      return "extract_liquid";
    }

    if (hasTerm(displayName, FERMENTABLE_FRUIT_TERMS)) {
      return "fruit_fermentable";
    }

    if (input.type === "adjunct" || hasTerm(displayName, FERMENTABLE_ADJUNCT_TERMS)) {
      return "adjunct_grain";
    }

    if (hasTerm(displayName, FERMENTABLE_ROASTED_TERMS)) {
      return "roasted_malt";
    }

    if (hasTerm(displayName, FERMENTABLE_SPECIALTY_TERMS)) {
      return "specialty_malt";
    }

    if (hasTerm(displayName, FERMENTABLE_BASE_MALT_TERMS) || displayName.includes("malt")) {
      return "base_malt";
    }

    return null;
  }

  if (category === "hop") {
    const fromHopForm = normalizeIngredientSubtype("hop", input.hopForm ?? null);
    return fromHopForm ?? (!input.subtype ? "standard" : null);
  }

  if (category === "yeast") {
    if (displayName.includes("kveik")) {
      return "kveik";
    }

    if (displayName.includes("brett") || displayName.includes("lacto") || displayName.includes("pedio") || displayName.includes("wild")) {
      return "wild_bacteria";
    }

    if (displayName.includes("belg") || displayName.includes("saison") || displayName.includes("abbey") || displayName.includes("wit")) {
      return displayName.includes("wit") ? "wheat" : "belgian";
    }

    if (displayName.includes("weizen") || displayName.includes("wheat")) {
      return "wheat";
    }

    if (input.yeastType === "ale" || displayName.includes("ale")) {
      return "ale";
    }

    if (input.yeastType === "lager" || displayName.includes("lager")) {
      return "lager";
    }

    return "other";
  }

  if (category === "water_prep") {
    if (hasTerm(displayName, WATER_SOURCE_TERMS)) {
      return "water_source";
    }

    if (hasTerm(displayName, WATER_DECHLORINATION_TERMS)) {
      return "dechlorination";
    }

    if (hasTerm(displayName, WATER_ACID_TERMS)) {
      return "acid";
    }

    if (hasTerm(displayName, WATER_BASE_TERMS)) {
      return "base";
    }

    if (hasTerm(displayName, NUTRIENT_TERMS)) {
      return "nutrient_other";
    }

    return "salt";
  }

  if (input.type === "fining") {
    return "fining";
  }

  if (hasTerm(displayName, ANTIOXIDANT_TERMS)) {
    return "antioxidant";
  }

  if (hasTerm(displayName, NUTRIENT_TERMS)) {
    return "nutrient";
  }

  if (hasTerm(displayName, SPICE_TERMS)) {
    return "spice_herb";
  }

  if (hasTerm(displayName, WOOD_TERMS)) {
    return "wood";
  }

  if (hasTerm(displayName, FLAVORING_TERMS)) {
    return "flavoring";
  }

  if (displayName.includes("enzyme")) {
    return "enzyme";
  }

  if (hasTerm(displayName, CLEANER_TERMS)) {
    return "cleaner";
  }

  if (hasTerm(displayName, SANITIZER_TERMS)) {
    return "sanitizer";
  }

  if (hasTerm(displayName, GAS_TERMS)) {
    return "gas";
  }

  if (hasTerm(displayName, PRESERVATIVE_TERMS)) {
    return "preservative";
  }

  if (hasTerm(displayName, PROCESS_AID_TERMS) || stage === "sanitation") {
    return "process_aid";
  }

  return "other";
};

export const resolveLegacyIngredientType = (input: ResolveIngredientTaxonomyInput): LegacyIngredientType => {
  if (input.type && isLegacyIngredientType(input.type)) {
    return input.type;
  }

  const category = resolveIngredientCategory(input);
  const subtype = resolveIngredientSubtype(input);

  if (category === "fermentable") {
    if (subtype === "sugar" || subtype === "syrup_honey") {
      return "sugar";
    }

    if (subtype === "adjunct_grain" || subtype === "fruit_fermentable") {
      return "adjunct";
    }

    return "fermentable";
  }

  if (category === "hop" || category === "yeast") {
    return category;
  }

  if (category === "misc" && subtype === "fining") {
    return "fining";
  }

  return "misc";
};

export const resolveIngredientMatchPolicy = (
  input: Pick<ResolveIngredientTaxonomyInput, "category" | "type" | "subtype">
): IngredientMatchPolicy => {
  const category = resolveIngredientCategory(input);

  if (category === "yeast" || category === "misc") {
    return "exact_only";
  }

  return "family_compatible";
};

const normalizeAllowedUnits = (units: string[]): IngredientDisplayUnit[] => {
  const seen = new Set<IngredientDisplayUnit>();
  const normalized: IngredientDisplayUnit[] = [];

  for (const unit of units) {
    if (!isIngredientDisplayUnit(unit) || seen.has(unit)) {
      continue;
    }

    seen.add(unit);
    normalized.push(unit);
  }

  return normalized;
};

export const resolveIngredientUnits = (
  input: ResolveIngredientUnitsInput
): {
  defaultDisplayUnit: IngredientDisplayUnit;
  allowedUnits: IngredientDisplayUnit[];
  measurementDimension: IngredientMeasurementDimension;
} => {
  const category = resolveIngredientCategory(input);
  const subtype = resolveIngredientSubtype(input);
  const requestedUnit = input.defaultDisplayUnit ?? input.defaultUnit ?? null;

  if (requestedUnit && isIngredientDisplayUnit(requestedUnit)) {
    const measurementDimension = getIngredientMeasurementDimensionForUnit(requestedUnit);
    const dimensionUnits = UNITS_BY_DIMENSION[measurementDimension];
    const allowedUnits = normalizeAllowedUnits(
      category === "yeast"
        ? [
          requestedUnit,
          ...(input.yeastForm === "liquid" ? ["pack", "ml"] : ["pack", "g"])
        ]
        : category === "misc" && requestedUnit === "item"
          ? ["item", "pack"]
          : dimensionUnits
    );

    return {
      defaultDisplayUnit: requestedUnit,
      allowedUnits,
      measurementDimension
    };
  }

  if (category === "fermentable") {
    return {
      defaultDisplayUnit: "kg",
      allowedUnits: WEIGHT_UNITS,
      measurementDimension: "weight"
    };
  }

  if (category === "hop") {
    return {
      defaultDisplayUnit: "g",
      allowedUnits: WEIGHT_UNITS,
      measurementDimension: "weight"
    };
  }

  if (category === "yeast") {
    const isLiquid = input.yeastForm === "liquid";

    return {
      defaultDisplayUnit: "pack",
      allowedUnits: normalizeAllowedUnits(isLiquid ? ["pack", "ml"] : ["pack", "g"]),
      measurementDimension: "count"
    };
  }

  if (category === "water_prep") {
    if (subtype === "water_source") {
      return {
        defaultDisplayUnit: "l",
        allowedUnits: VOLUME_UNITS,
        measurementDimension: "volume"
      };
    }

    if (subtype === "acid") {
      return {
        defaultDisplayUnit: "ml",
        allowedUnits: VOLUME_UNITS,
        measurementDimension: "volume"
      };
    }

    return {
      defaultDisplayUnit: "g",
      allowedUnits: WEIGHT_UNITS,
      measurementDimension: "weight"
    };
  }

  return {
    defaultDisplayUnit: "item",
    allowedUnits: COUNT_UNITS,
    measurementDimension: "count"
  };
};

export const resolveIngredientCompletenessLevel = (
  input: ResolveIngredientCompletenessInput
): IngredientCompletenessLevel => {
  if (input.completenessLevel && isIngredientCompletenessLevel(input.completenessLevel)) {
    return input.completenessLevel;
  }

  const category = resolveIngredientCategory(input);
  const subtype = resolveIngredientSubtype(input);
  const properties = isRecord(input.properties) ? input.properties : {};

  let hasRecommendedFields = Boolean(input.displayName?.trim());

  if (category === "fermentable") {
    hasRecommendedFields = hasRecommendedFields
      && input.fermentableColorEbc != null
      && input.fermentableExtractYieldPct != null;
  }

  if (category === "hop") {
    hasRecommendedFields = hasRecommendedFields
      && input.hopAlphaAcidPct != null;
  }

  if (category === "yeast") {
    hasRecommendedFields = hasRecommendedFields
      && input.yeastAttenuationPct != null
      && Boolean(input.yeastForm);
  }

  if (category === "water_prep") {
    if (subtype === "acid") {
      hasRecommendedFields = hasRecommendedFields && typeof properties.acidType === "string";
    } else if (subtype === "salt" || subtype === "base") {
      hasRecommendedFields = hasRecommendedFields && typeof properties.compound === "string";
    }
  }

  if (!hasRecommendedFields) {
    return "minimum";
  }

  const metadataScore = [
    Array.isArray(input.aliases) && input.aliases.length > 0,
    Boolean(input.description?.trim()),
    Boolean(input.brandName?.trim() || input.manufacturer?.trim()),
    Boolean(input.country?.trim()),
    input.harvestYear != null
  ].filter(Boolean).length;

  return metadataScore >= 2 ? "full" : "recommended";
};

export {
  fermentableSubtypes,
  hopSubtypes,
  ingredientCategories,
  ingredientCompletenessLevels,
  ingredientDisplayUnits,
  ingredientMatchPolicies,
  ingredientMeasurementDimensions,
  legacyIngredientTypes,
  miscSubtypes,
  waterPrepSubtypes,
  yeastSubtypes
};
export type {
  FermentableSubtype,
  HopSubtype,
  IngredientCategory,
  IngredientCompletenessLevel,
  IngredientDisplayUnit,
  IngredientMatchPolicy,
  IngredientMeasurementDimension,
  IngredientSubtype,
  LegacyIngredientType,
  MiscSubtype,
  WaterPrepSubtype,
  YeastSubtype
};
