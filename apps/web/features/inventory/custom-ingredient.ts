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

export const customHopForms = ["pellet", "whole_cone", "lupulin", "cryo", "standard"] as const;
export type CustomHopForm = (typeof customHopForms)[number];

export const customHopFormLabels: Record<CustomHopForm, string> = {
  pellet: "Пеллеты",
  whole_cone: "Шишковой",
  lupulin: "Люпулин",
  cryo: "Cryo",
  standard: "Стандарт"
};

export const customPhysicalForms = ["solid", "powder", "crystal", "liquid", "solution", "tablet"] as const;
export type CustomPhysicalForm = (typeof customPhysicalForms)[number];

export const customPhysicalFormLabels: Record<CustomPhysicalForm, string> = {
  solid: "Твёрдая",
  powder: "Порошок",
  crystal: "Кристаллы",
  liquid: "Жидкость",
  solution: "Раствор",
  tablet: "Таблетки"
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
  fermentableProteinPct,
  maltType,
  fermentableMaxUsagePct,
  hopAlphaAcidPct,
  hopBetaAcidPct,
  hopForm,
  yeastAttenuationPct,
  yeastForm,
  yeastFlocculation,
  yeastMinFermentationTempC,
  yeastMaxFermentationTempC,
  alcoholToleranceAbvTypical,
  physicalForm,
  concentration,
  unitPreferred
}: {
  type: IngredientType;
  fermentableColorEbc?: number | null;
  fermentableExtractYieldPct?: number | null;
  fermentableProteinPct?: number | null;
  maltType?: string | null;
  fermentableMaxUsagePct?: number | null;
  hopAlphaAcidPct?: number | null;
  hopBetaAcidPct?: number | null;
  hopForm?: CustomHopForm | null;
  yeastAttenuationPct?: number | null;
  yeastForm?: CustomYeastForm | null;
  yeastFlocculation?: string | null;
  yeastMinFermentationTempC?: number | null;
  yeastMaxFermentationTempC?: number | null;
  alcoholToleranceAbvTypical?: number | null;
  physicalForm?: CustomPhysicalForm | null;
  concentration?: string | null;
  unitPreferred?: string | null;
}): IngredientTechnicalData => {
  if (type === "malt") {
    const colorEbc = fermentableColorEbc ?? null;
    return {
      type,
      maltType: maltType ?? null,
      colorEbcMin: colorEbc,
      colorEbcMax: colorEbc,
      colorLovibond: colorEbc == null ? null : ebcToLovibond(colorEbc),
      extractPctDryBasis: fermentableExtractYieldPct ?? null,
      proteinPct: fermentableProteinPct ?? null,
      maxUsagePct: fermentableMaxUsagePct ?? null
    };
  }

  if (type === "fermentable") {
    return {
      type,
      colorLovibond: fermentableColorEbc == null ? null : ebcToLovibond(fermentableColorEbc),
      extractPctDryBasis: fermentableExtractYieldPct ?? null,
      proteinPct: fermentableProteinPct ?? null
    };
  }

  if (type === "hop") {
    return {
      type,
      alphaAcidPctTypical: hopAlphaAcidPct ?? null,
      betaAcidPctTypical: hopBetaAcidPct ?? null,
      hopForm: hopForm ?? null
    };
  }

  if (type === "yeast") {
    return {
      type,
      attenuationPctTypical: yeastAttenuationPct ?? null,
      form: yeastForm ?? null,
      flocculation: yeastFlocculation ?? null,
      fermentationTempCMin: yeastMinFermentationTempC ?? null,
      fermentationTempCMax: yeastMaxFermentationTempC ?? null,
      alcoholToleranceAbvTypical: alcoholToleranceAbvTypical ?? null,
      packageSize: yeastForm === "dry" ? 11 : null,
      packageUnit: yeastForm === "dry" ? "g" : null
    };
  }

  if (type === "consumable") {
    return {
      type,
      commonForms: physicalForm ? [physicalForm] : [],
      dosageReference: concentration ? { label: concentration } : null
    };
  }

  if (type === "water_treatment") {
    return {
      type,
      commonForms: physicalForm ? [physicalForm] : [],
      unitPreferred: unitPreferred ?? null,
      typicalUseRu: concentration ?? null
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
