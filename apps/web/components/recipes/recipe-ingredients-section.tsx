import React from "react";
import { Droplets, FlaskConical, Hop, Package, Wheat } from "lucide-react";
import { resolveIngredientCategory } from "@/features/ingredients/taxonomy";
import type { RecipeDetailDto } from "@/features/recipes/contracts";
import { fermentableUseLabels, hopUseTypeLabels } from "@/features/recipes/ingredient-labels";
import {
  formatRecipeIngredientAmount,
  recipeIngredientCategoryOf,
  recipeIngredientDurationDays,
  recipeIngredientTimeMinutes,
  recipeIngredientUseType,
  resolveRecipeIngredientNames
} from "@/features/recipes/ingredient-presentation";

import {
  buildRecipeIngredientTechnicalBadges,
  RecipeIngredientTechnicalBadges,
  RecipeIngredientTitleBlock,
  type RecipeIngredientTechnicalBadge,
  type RecipeIngredientCardSource
} from "./recipe-ingredient-card-display";

type RecipeIngredient = RecipeDetailDto["ingredients"][number];

const stageLabel: Record<RecipeIngredient["stage"], string> = {
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
  consumable: "Специи и добавки"
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

// Мета-строка позиции (этап · назначение · время …). У хмеля этап и время уезжают
// в правую колонку под количеством (см. hopTimingLabel) — здесь их не дублируем.
const buildMetaLine = (ingredient: RecipeIngredient, { omitStageAndTiming = false } = {}): string | null => {
  const stepMeta = (ingredient.stepMeta ?? {}) as Record<string, unknown>;
  const currentStageLabel = stageLabel[ingredient.stage];
  const parts = omitStageAndTiming ? [] : [currentStageLabel];

  if (!omitStageAndTiming && typeof stepMeta.useType === "string" && stepMeta.useType !== ingredient.stage) {
    const useTypeLabel = hopUseTypeLabels[stepMeta.useType as keyof typeof hopUseTypeLabels];
    if (useTypeLabel && useTypeLabel !== currentStageLabel) {
      parts.push(useTypeLabel);
    }
  }
  if (typeof stepMeta.use === "string" && stepMeta.use !== ingredient.stage) {
    const useLabel = fermentableUseLabels[stepMeta.use as keyof typeof fermentableUseLabels];
    if (useLabel && useLabel !== currentStageLabel) {
      parts.push(useLabel);
    }
  }
  if (!omitStageAndTiming) {
    if (typeof stepMeta.timeMinutes === "number") {
      parts.push(`${stepMeta.timeMinutes} мин`);
    } else if (ingredient.timeOffset !== null) {
      parts.push(`${ingredient.timeOffset} мин`);
    }
  }
  if (typeof stepMeta.temperatureC === "number") {
    parts.push(`${stepMeta.temperatureC} °C`);
  }
  if (!omitStageAndTiming && typeof stepMeta.durationDays === "number") {
    parts.push(`${stepMeta.durationDays} дн`);
  }
  if (typeof stepMeta.fermentationTempC === "number") {
    parts.push(`${stepMeta.fermentationTempC} °C`);
  }
  if (typeof stepMeta.stageLabel === "string" && stepMeta.stageLabel.trim()) {
    parts.push(stepMeta.stageLabel.trim());
  }

  return parts.length ? parts.join(" · ") : null;
};

// Тайминг хмеля для правой колонки: у кипа главное — минута внесения, у остальных
// назначений — сам этап. Термины — из hopUseTypeLabels, новых слов не изобретаем.
const hopTimingLabel = (ingredient: RecipeIngredient): string | null => {
  const useType = recipeIngredientUseType(ingredient);
  const timeMinutes = recipeIngredientTimeMinutes(ingredient);
  const durationDays = recipeIngredientDurationDays(ingredient);

  if (ingredient.stage === "mash") {
    return stageLabel.mash;
  }
  if (useType === "first_wort_hop") {
    return "Первое сусло";
  }
  if (ingredient.stage === "whirlpool" || useType === "whirlpool") {
    return timeMinutes != null && timeMinutes > 0 ? `Вирпул · ${timeMinutes} мин` : "Вирпул";
  }
  if (ingredient.stage === "fermentation" || useType === "dry_hop") {
    return durationDays != null ? `Сухое охмеление · ${durationDays} дн` : "Сухое охмеление";
  }
  if (useType === "dip_hop") {
    return "Дип-хоп";
  }
  if (ingredient.stage === "boil") {
    return timeMinutes != null ? `${timeMinutes} мин` : stageLabel.boil;
  }
  return stageLabel[ingredient.stage] ?? null;
};

// Порядок хмеля = порядок внесений: затор → FWH → кип (от больших минут к меньшим)
// → вирпул → сухое охмеление.
const hopScheduleRank = (ingredient: RecipeIngredient): number => {
  const useType = recipeIngredientUseType(ingredient);
  if (ingredient.stage === "mash") return 0;
  if (useType === "first_wort_hop") return 1;
  if (ingredient.stage === "whirlpool" || useType === "whirlpool") return 3;
  if (ingredient.stage === "fermentation" || useType === "dry_hop") return 4;
  if (ingredient.stage === "boil") return 2;
  return 5;
};

const sortGroupItems = (category: SectionCategory, items: RecipeIngredient[]): RecipeIngredient[] => {
  const indexed = items.map((ingredient, index) => ({ ingredient, index }));
  if (category === "fermentable") {
    indexed.sort((a, b) => (
      (b.ingredient.amountNormalizedQuantity ?? -1) - (a.ingredient.amountNormalizedQuantity ?? -1)
      || a.index - b.index
    ));
  } else if (category === "hop") {
    indexed.sort((a, b) => (
      hopScheduleRank(a.ingredient) - hopScheduleRank(b.ingredient)
      || (recipeIngredientTimeMinutes(b.ingredient) ?? -1) - (recipeIngredientTimeMinutes(a.ingredient) ?? -1)
      || a.index - b.index
    ));
  }
  return indexed.map(({ ingredient }) => ingredient);
};

// Доля в засыпи по нормализованной массе; считается только когда у позиции и у
// всей группы масса в граммах — смешанные единицы долю не образуют.
const grainSharePct = (ingredient: RecipeIngredient, totalGrams: number): string | null => {
  if (totalGrams <= 0 || ingredient.amountNormalizedUnit !== "g" || ingredient.amountNormalizedQuantity == null) {
    return null;
  }
  const share = (ingredient.amountNormalizedQuantity / totalGrams) * 100;
  if (!Number.isFinite(share) || share <= 0) {
    return null;
  }
  return share < 1 ? "<1%" : `${Math.round(share)}%`;
};

const buildIngredientCardSource = (ingredient: RecipeIngredient): RecipeIngredientCardSource => {
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
    items: sortGroupItems(category, ingredients.filter((ingredient) => recipeIngredientCategoryOf(ingredient) === category))
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
          const totalGrainGrams = group.category === "fermentable"
            ? group.items.reduce((acc, item) => (
              item.amountNormalizedUnit === "g" && item.amountNormalizedQuantity != null
                ? acc + item.amountNormalizedQuantity
                : acc
            ), 0)
            : 0;
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
                  const { primaryName, secondaryName } = resolveRecipeIngredientNames(ingredient);
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
                  const isHop = group.category === "hop";
                  const metaLine = buildMetaLine(ingredient, { omitStageAndTiming: isHop });
                  const amountSubLabel = isHop
                    ? hopTimingLabel(ingredient)
                    : group.category === "fermentable"
                      ? grainSharePct(ingredient, totalGrainGrams)
                      : null;

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
                          {metaLine ? <div className="mt-0.5 text-xs text-muted-foreground">{metaLine}</div> : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-medium tabular-nums text-foreground">{formatRecipeIngredientAmount(ingredient)}</div>
                          {amountSubLabel ? (
                            <div className="mt-0.5 whitespace-nowrap text-xs font-medium tabular-nums text-muted-foreground">{amountSubLabel}</div>
                          ) : null}
                        </div>
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
