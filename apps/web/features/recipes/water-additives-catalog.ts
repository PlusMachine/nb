import type { BrewingAcidId, BrewingSaltId } from "@nb/brewing-core";

/**
 * Maps salt ids used by the brewing-core water plan to the canonical catalog
 * ingredient ids (`ingredients.id` slug from `water_treatment_catalog_minimal_v2.json`).
 *
 * The water plan emits computed salt additions that are not stored as
 * `recipe_ingredients`. This map lets the recipe editor / inventory layer
 * reason about whether the user already has the matching salt in stock.
 */
export const recipeWaterSaltCatalogIds: Record<BrewingSaltId, string> = {
  gypsum: "gypsum",
  calcium_chloride: "calcium-chloride-dihydrate",
  epsom_salt: "epsom-salt",
  baking_soda: "sodium-bicarbonate",
  table_salt: "sodium-chloride",
  chalk: "calcium-carbonate",
  slaked_lime: "calcium-hydroxide",
};

export const recipeWaterAcidCatalogIds: Record<BrewingAcidId, string> = {
  lactic_acid: "lactic-acid",
  phosphoric_acid: "phosphoric-acid-75-85",
};

export const recipeWaterDefaultAutoSaltIds = [
  "gypsum",
  "calcium_chloride",
  "epsom_salt",
] satisfies BrewingSaltId[];

export const recipeWaterManualSaltIds = [
  ...recipeWaterDefaultAutoSaltIds,
  "baking_soda",
  "table_salt",
  "chalk",
  "slaked_lime",
] satisfies BrewingSaltId[];

export const recipeWaterSupportedAcidIds = [
  "lactic_acid",
  "phosphoric_acid",
] satisfies BrewingAcidId[];

export const recipeWaterAddFlowCatalogIds = [
  ...recipeWaterManualSaltIds.map((id) => recipeWaterSaltCatalogIds[id]),
];

export const recipeWaterAdditiveCatalogIds = {
  ...recipeWaterSaltCatalogIds,
  ...recipeWaterAcidCatalogIds,
} satisfies Record<string, string>;

const recipeWaterSaltIdsByCatalogId = Object.fromEntries(
  Object.entries(recipeWaterSaltCatalogIds).map(([saltId, catalogId]) => [
    catalogId,
    saltId,
  ]),
) as Partial<Record<string, BrewingSaltId>>;

export const resolveRecipeWaterSaltIdFromCatalogId = (
  catalogIngredientId: string | null | undefined,
): BrewingSaltId | null =>
  catalogIngredientId
    ? recipeWaterSaltIdsByCatalogId[catalogIngredientId] ?? null
    : null;

export type RecipeWaterAdditiveKind = "salt" | "acid";

export const resolveRecipeWaterAdditiveCatalogId = (
  id: string,
  kind: RecipeWaterAdditiveKind,
): string | null => {
  if (kind === "salt") {
    return recipeWaterSaltCatalogIds[id as BrewingSaltId] ?? null;
  }

  return recipeWaterAcidCatalogIds[id as BrewingAcidId] ?? null;
};
