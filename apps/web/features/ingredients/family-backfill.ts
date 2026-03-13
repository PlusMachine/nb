import { normalizeIngredientName } from "./normalization";
import {
  resolveIngredientCategory,
  resolveIngredientCompletenessLevel,
  resolveIngredientMatchPolicy,
  resolveIngredientSubtype,
  resolveIngredientUnits,
  type IngredientCategory,
  type IngredientCompletenessLevel,
  type IngredientMatchPolicy,
  type IngredientMeasurementDimension,
  type IngredientSubtype
} from "./taxonomy";

type LegacyCatalogBackfillInput = {
  id: string;
  type?: string | null;
  subtype?: string | null;
  displayName: string;
  normalizedName?: string | null;
  properties?: Record<string, unknown> | null;
  hopForm?: string | null;
  yeastType?: string | null;
  yeastForm?: string | null;
  defaultUnit?: string | null;
  defaultDisplayUnit?: string | null;
  aliases?: string[] | null;
  description?: string | null;
  brandName?: string | null;
  manufacturer?: string | null;
  country?: string | null;
  harvestYear?: number | null;
  fermentableColorEbc?: number | null;
  fermentableExtractYieldPct?: number | null;
  hopAlphaAcidPct?: number | null;
  yeastAttenuationPct?: number | null;
  completenessLevel?: string | null;
};

type IngredientBackfillSeed = {
  category: IngredientCategory;
  subtype: IngredientSubtype | null;
  canonicalFamilyName: string;
  normalizedCanonicalName: string;
  familyKey: string;
  matchPolicy: IngredientMatchPolicy;
  defaultDisplayUnit: string;
  allowedUnits: string[];
  measurementDimension: IngredientMeasurementDimension;
  completenessLevel: IngredientCompletenessLevel;
};

type IngredientBackfillAssignment = IngredientBackfillSeed & {
  itemId: string;
};

const deriveBackfillSeed = (item: LegacyCatalogBackfillInput): IngredientBackfillSeed => {
  const category = resolveIngredientCategory(item);
  const subtype = resolveIngredientSubtype(item);
  const canonicalFamilyName = item.displayName.trim();
  const normalizedCanonicalName = item.normalizedName?.trim() || normalizeIngredientName(canonicalFamilyName);
  const familyKey = `${category}:${normalizedCanonicalName}`;
  const matchPolicy = resolveIngredientMatchPolicy({ category, subtype });
  const units = resolveIngredientUnits(item);
  const completenessLevel = resolveIngredientCompletenessLevel(item);

  return {
    category,
    subtype,
    canonicalFamilyName,
    normalizedCanonicalName,
    familyKey,
    matchPolicy,
    defaultDisplayUnit: units.defaultDisplayUnit,
    allowedUnits: [...units.allowedUnits],
    measurementDimension: units.measurementDimension,
    completenessLevel
  };
};

export const buildIngredientFamilyBackfill = (items: LegacyCatalogBackfillInput[]) => {
  const assignments = items.map((item) => ({
    itemId: item.id,
    ...deriveBackfillSeed(item)
  })) satisfies IngredientBackfillAssignment[];

  const families = new Map<string, IngredientBackfillSeed>();
  for (const assignment of assignments) {
    if (!families.has(assignment.familyKey)) {
      families.set(assignment.familyKey, {
        category: assignment.category,
        subtype: assignment.subtype,
        canonicalFamilyName: assignment.canonicalFamilyName,
        normalizedCanonicalName: assignment.normalizedCanonicalName,
        familyKey: assignment.familyKey,
        matchPolicy: assignment.matchPolicy,
        defaultDisplayUnit: assignment.defaultDisplayUnit,
        allowedUnits: [...assignment.allowedUnits],
        measurementDimension: assignment.measurementDimension,
        completenessLevel: assignment.completenessLevel
      });
    }
  }

  return {
    assignments,
    families: [...families.values()]
  };
};
