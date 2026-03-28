import type {
  IngredientCategory,
  IngredientTechnicalData,
  IngredientType
} from "../ingredients/contracts";
import type { IngredientSubtype } from "../ingredients/taxonomy";
import { resolveHumanFacingInventoryUnitProfile } from "./units";

export const customYeastForms = ["dry", "liquid", "slurry", "culture"] as const;
export type CustomYeastForm = (typeof customYeastForms)[number];

export const customYeastFormLabels: Record<CustomYeastForm, string> = {
  dry: "Сухие",
  liquid: "Жидкие",
  slurry: "Суспензия",
  culture: "Культура"
};

export const customIngredientSubtypeFieldCategories = ["fermentable", "consumable", "water_treatment"] as const;

const ebcToLovibond = (value: number) => Number((value / 1.97).toFixed(2));

export const shouldShowCustomIngredientSubtypeField = (category: IngredientCategory) => (
  customIngredientSubtypeFieldCategories.includes(
    category as (typeof customIngredientSubtypeFieldCategories)[number]
  )
);

export const resolveDefaultCustomIngredientSubtype = (
  category: IngredientCategory
): IngredientSubtype | null => {
  if (category === "fermentable") {
    return "fermentable";
  }

  if (category === "consumable" || category === "water_treatment") {
    return "other";
  }

  return null;
};

export const normalizeCustomIngredientSubtype = (
  category: IngredientCategory,
  requestedSubtype?: string | null
): IngredientSubtype | null => {
  const normalized = String(requestedSubtype ?? "").trim();
  if (!shouldShowCustomIngredientSubtypeField(category)) {
    return null;
  }

  return (normalized || resolveDefaultCustomIngredientSubtype(category)) as IngredientSubtype | null;
};

export const buildCustomIngredientTechnicalData = ({
  type,
  fermentableColorEbc,
  fermentableExtractYieldPct,
  hopAlphaAcidPct,
  yeastAttenuationPct,
  yeastForm
}: {
  type: IngredientType;
  fermentableColorEbc?: number | null;
  fermentableExtractYieldPct?: number | null;
  hopAlphaAcidPct?: number | null;
  yeastAttenuationPct?: number | null;
  yeastForm?: CustomYeastForm | null;
}): IngredientTechnicalData => {
  if (type === "malt") {
    const colorEbc = fermentableColorEbc ?? null;
    return {
      type,
      colorEbcMin: colorEbc,
      colorEbcMax: colorEbc,
      colorLovibond: colorEbc == null ? null : ebcToLovibond(colorEbc),
      extractPctDryBasis: fermentableExtractYieldPct ?? null
    };
  }

  if (type === "fermentable") {
    return {
      type,
      colorLovibond: fermentableColorEbc == null ? null : ebcToLovibond(fermentableColorEbc),
      extractPctDryBasis: fermentableExtractYieldPct ?? null
    };
  }

  if (type === "hop") {
    return {
      type,
      alphaAcidPctTypical: hopAlphaAcidPct ?? null
    };
  }

  if (type === "yeast") {
    return {
      type,
      attenuationPctTypical: yeastAttenuationPct ?? null,
      form: yeastForm ?? null,
      packageSize: yeastForm === "dry" ? 11 : null,
      packageUnit: yeastForm === "dry" ? "g" : null
    };
  }

  return { type };
};

export const resolveCustomIngredientUnitProfile = ({
  type,
  category,
  subtype,
  technicalData
}: {
  type: IngredientType;
  category: IngredientCategory;
  subtype: IngredientSubtype | null;
  technicalData: IngredientTechnicalData | null;
}) => resolveHumanFacingInventoryUnitProfile({
  type,
  category,
  subtype,
  technicalData
});
