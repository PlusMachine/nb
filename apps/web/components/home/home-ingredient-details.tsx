import type { ReactNode } from "react";
import {
  buildRecipeIngredientTechnicalBadges,
  RecipeIngredientTechnicalBadges,
  RecipeIngredientTitleBlock,
  type RecipeIngredientCardSource
} from "@/components/recipes/recipe-ingredient-card-display";
import type { RecipeIngredientDto } from "@/features/recipes/contracts";
import { resolveIngredientDisplayNames } from "@/features/ingredients/presentation";
import { buildRecipeIngredientCardSource } from "@/features/recipes/ingredient-presentation";

/** The same identity, flags and technical badges used by the recipe editor. */
export function HomeIngredientDetails({
  ingredient,
  source: catalogSource,
  name,
  secondaryName,
  titleHref,
  badgeLimit = 2,
  compact = false,
  showSecondaryName = !compact,
  children
}: {
  ingredient?: RecipeIngredientDto;
  source?: RecipeIngredientCardSource;
  name: string;
  secondaryName?: string | null;
  titleHref?: string;
  badgeLimit?: number;
  compact?: boolean;
  showSecondaryName?: boolean;
  children?: ReactNode;
}) {
  const source = catalogSource ?? (ingredient ? buildRecipeIngredientCardSource(ingredient) : {});
  const names = ingredient ? resolveIngredientDisplayNames({
    displayName: ingredient.ingredientDisplayName || ingredient.ingredientDisplayNameRu || name,
    displayNameRu: ingredient.ingredientDisplayNameRu,
    displayNameEn: ingredient.ingredientDisplayNameEn
  }) : { primaryName: name, secondaryName };
  const badges = buildRecipeIngredientTechnicalBadges(source, { includeConsumableUsageStage: false }).slice(0, badgeLimit);

  return <div className="home-ingredient-details">
    <RecipeIngredientTitleBlock
      source={source}
      primaryName={names.primaryName}
      secondaryName={showSecondaryName ? names.secondaryName : undefined}
      titleClassName="home-ingredient-title"
      titleHref={titleHref}
      brandPlacement={compact ? "below" : "inline"}
    />
    {children}
    <RecipeIngredientTechnicalBadges badges={badges} className="home-ingredient-badges" />
  </div>;
}
