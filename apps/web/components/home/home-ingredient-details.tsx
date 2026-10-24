import type { ReactNode } from "react";
import {
  buildRecipeIngredientTechnicalBadges,
  RecipeIngredientTechnicalBadges,
  RecipeIngredientTitleBlock
} from "@/components/recipes/recipe-ingredient-card-display";
import type { RecipeIngredientDto } from "@/features/recipes/contracts";
import { resolveIngredientDisplayNames } from "@/features/ingredients/presentation";
import { buildRecipeIngredientCardSource } from "@/features/recipes/ingredient-presentation";

/** The same identity, flags and technical badges used by the recipe editor. */
export function HomeIngredientDetails({
  ingredient,
  name,
  badgeLimit = 2,
  compact = false,
  children
}: {
  ingredient?: RecipeIngredientDto;
  name: string;
  badgeLimit?: number;
  compact?: boolean;
  children?: ReactNode;
}) {
  const source = ingredient ? buildRecipeIngredientCardSource(ingredient) : {};
  const names = ingredient ? resolveIngredientDisplayNames({
    displayName: ingredient.ingredientDisplayName || ingredient.ingredientDisplayNameRu || name,
    displayNameRu: ingredient.ingredientDisplayNameRu,
    displayNameEn: ingredient.ingredientDisplayNameEn
  }) : { primaryName: name, secondaryName: undefined };
  const badges = buildRecipeIngredientTechnicalBadges(source, { includeConsumableUsageStage: false }).slice(0, badgeLimit);

  return <div className="home-ingredient-details">
    <RecipeIngredientTitleBlock
      source={source}
      primaryName={names.primaryName}
      secondaryName={compact ? undefined : names.secondaryName}
      titleClassName="home-ingredient-title"
      brandPlacement={compact ? "below" : "inline"}
    />
    {children}
    <RecipeIngredientTechnicalBadges badges={badges} className="home-ingredient-badges" />
  </div>;
}
