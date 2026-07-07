import React from "react";
import { Droplets, FlaskConical, Hop, Package, Wheat } from "lucide-react";
import { resolveIngredientDisplayNames } from "@/features/ingredients/presentation";
import { resolveIngredientCategory } from "@/features/ingredients/taxonomy";
import { formatInventoryQuantityForDisplay } from "@/features/inventory/display";
import type { RecipeDetailDto } from "@/features/recipes/contracts";
import { fermentableUseLabels, hopUseTypeLabels } from "@/features/recipes/ingredient-labels";

import {
  buildRecipeIngredientTechnicalBadges,
  RecipeIngredientTechnicalBadges,
  RecipeIngredientTitleBlock,
  type RecipeIngredientTechnicalBadge,
  type RecipeIngredientCardSource
} from "./recipe-ingredient-card-display";

const stageLabel: Record<RecipeDetailDto["ingredients"][number]["stage"], string> = {
  mash: "Затирание",
  boil: "Кипячение",
  whirlpool: "Вирпул",
  fermentation: "Брожение",
  packaging: "Розлив",
  other: "Другое"
};

const sectionOrder = ["fermentable", "hop", "yeast", "water_treatment", "consumable"] as const;
type SectionCategory = (typeof sectionOrder)[number];

const sectionLabels: Record<SectionCategory, string> = {
  fermentable: "Сбраживаемое",
  hop: "Хмель",
  yeast: "Дрожжи",
  water_treatment: "Водоподготовка",
  consumable: "Другие добавки"
};

const sectionIcons: Record<SectionCategory, React.ComponentType<{ className?: string }>> = {
  fermentable: Wheat,
  hop: Hop,
  yeast: FlaskConical,
  water_treatment: Droplets,
  consumable: Package
};

const sectionIconBg: Record<SectionCategory, string> = {
  fermentable: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  hop: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  yeast: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
  water_treatment: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
  consumable: "bg-muted text-muted-foreground"
};

const sectionAccentBorder: Record<SectionCategory, string> = {
  fermentable: "border-l-amber-400",
  hop: "border-l-emerald-500",
  yeast: "border-l-violet-400",
  water_treatment: "border-l-sky-400",
  consumable: "border-l-border"
};

const buildMetaLine = (ingredient: RecipeDetailDto["ingredients"][number]) => {
  const stepMeta = (ingredient.stepMeta ?? {}) as Record<string, unknown>;
  const currentStageLabel = stageLabel[ingredient.stage];
  const parts = [currentStageLabel];

  if (typeof stepMeta.useType === "string") {
    const useTypeLabel = hopUseTypeLabels[stepMeta.useType as keyof typeof hopUseTypeLabels];
    if (useTypeLabel && useTypeLabel !== currentStageLabel) {
      parts.push(useTypeLabel);
    }
  }
  if (typeof stepMeta.use === "string") {
    const useLabel = fermentableUseLabels[stepMeta.use as keyof typeof fermentableUseLabels];
    if (useLabel && useLabel !== currentStageLabel) {
      parts.push(useLabel);
    }
  }
  if (typeof stepMeta.timeMinutes === "number") {
    parts.push(`${stepMeta.timeMinutes} мин`);
  } else if (ingredient.timeOffset !== null) {
    parts.push(`${ingredient.timeOffset} мин`);
  }
  if (typeof stepMeta.temperatureC === "number") {
    parts.push(`${stepMeta.temperatureC} °C`);
  }
  if (typeof stepMeta.durationDays === "number") {
    parts.push(`${stepMeta.durationDays} дн`);
  }
  if (typeof stepMeta.fermentationTempC === "number") {
    parts.push(`${stepMeta.fermentationTempC} °C`);
  }
  if (typeof stepMeta.stageLabel === "string" && stepMeta.stageLabel.trim()) {
    parts.push(stepMeta.stageLabel.trim());
  }

  return parts.join(" · ");
};

const buildIngredientCardSource = (ingredient: RecipeDetailDto["ingredients"][number]): RecipeIngredientCardSource => {
  const category = ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type });

  return {
    type: ingredient.type,
    category,
    subtype: ingredient.ingredientSubtype ?? null,
    brand: ingredient.ingredientBrand ?? null,
    producer: ingredient.ingredientProducer ?? null,
    brandName: ingredient.ingredientBrandName ?? null,
    manufacturer: ingredient.ingredientManufacturer ?? null,
    countryCode: ingredient.ingredientCountryCode ?? null,
    countryName: ingredient.ingredientCountryName ?? null,
    country: ingredient.ingredientCountry ?? null,
    technicalData: ingredient.ingredientTechnicalData ?? null
  };
};

export function RecipeIngredientsSection({ ingredients }: { ingredients: RecipeDetailDto["ingredients"] }) {
  const grouped = sectionOrder.map((category) => ({
    category,
    items: ingredients.filter((ingredient) => (ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type })) === category)
  }));

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-foreground">Ингредиенты</h2>
      {ingredients.length === 0 ? <p className="text-sm text-muted-foreground">Ингредиенты пока не добавлены.</p> : null}
      <div className="space-y-5">
        {grouped.map((group) => {
          if (!group.items.length) return null;
          const IconComponent = sectionIcons[group.category];
          const iconBg = sectionIconBg[group.category];
          const accent = sectionAccentBorder[group.category];
          return (
            <div key={group.category} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-md ${iconBg}`}>
                  <IconComponent className="h-3.5 w-3.5" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">{sectionLabels[group.category]}</h3>
                <span className="text-xs tabular-nums text-muted-foreground">({group.items.length})</span>
              </div>
              <ul className="space-y-1.5">
                {group.items.map((ingredient) => {
                  const { primaryName, secondaryName } = resolveIngredientDisplayNames({
                    displayName: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? ingredient.type,
                    displayNameRu: ingredient.ingredientDisplayNameRu,
                    displayNameEn: ingredient.ingredientDisplayNameEn
                  });
                  const cardSource = buildIngredientCardSource(ingredient);
                  const titleHref = ingredient.ingredientCatalogItemId
                    ? `/catalog/system/${ingredient.ingredientCatalogItemId}`
                    : null;
                  const technicalBadges = buildRecipeIngredientTechnicalBadges(cardSource, {
                    includeConsumableUsageStage: group.category !== "consumable"
                  });
                  const recipeStageBadges: RecipeIngredientTechnicalBadge[] = group.category === "consumable" && ingredient.stage !== "other"
                    ? [{
                      key: `recipe-stage:${ingredient.stage}`,
                      label: stageLabel[ingredient.stage]
                    }]
                    : [];
                  const badges = [...recipeStageBadges, ...technicalBadges];
                  const summaryFallback = badges.length ? null : ingredient.ingredientSummary;

                  return (
                    <li key={ingredient.id} className={`rounded-lg border-l-[3px] bg-card px-3 py-2.5 ring-1 ring-border ${accent}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <RecipeIngredientTitleBlock
                            source={cardSource}
                            primaryName={primaryName}
                            secondaryName={secondaryName}
                            titleClassName="truncate text-sm font-medium text-foreground"
                            titleHref={titleHref}
                          />
                          {summaryFallback ? <div className="mt-1 text-xs text-muted-foreground">{summaryFallback}</div> : null}
                          <RecipeIngredientTechnicalBadges badges={badges} className="mt-1.5" />
                          <div className="mt-0.5 text-xs text-muted-foreground">{buildMetaLine(ingredient)}</div>
                        </div>
                        <div className="shrink-0 text-right text-sm font-medium tabular-nums text-foreground">{formatInventoryQuantityForDisplay({
                          enteredQuantity: ingredient.amountEnteredQuantity,
                          enteredUnit: ingredient.amountEnteredUnit,
                          normalizedQuantity: ingredient.amountNormalizedQuantity,
                          normalizedUnit: ingredient.amountNormalizedUnit,
                          type: ingredient.type,
                          category: ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type }),
                          subtype: ingredient.ingredientSubtype ?? null,
                          defaultDisplayUnit: ingredient.ingredientDefaultDisplayUnit ?? ingredient.ingredientDefaultDisplayUnitSnapshot,
                          allowedUnits: ingredient.ingredientAllowedUnits ?? null,
                          measurementDimension: ingredient.ingredientMeasurementDimension ?? ingredient.ingredientMeasurementDimensionSnapshot ?? null
                        })}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
