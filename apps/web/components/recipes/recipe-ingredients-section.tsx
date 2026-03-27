import React from "react";
import { Droplets, FlaskConical, Hop, Package, Wheat } from "lucide-react";
import { resolveIngredientDisplayNames } from "@/features/ingredients/presentation";
import { resolveIngredientCategory } from "@/features/ingredients/taxonomy";
import { formatInventoryQuantityForDisplay } from "@/features/inventory/display";
import type { RecipeDetailDto } from "@/features/recipes/contracts";

const stageLabel: Record<RecipeDetailDto["ingredients"][number]["stage"], string> = {
  mash: "Затирание",
  boil: "Кипячение",
  whirlpool: "Вирпул",
  fermentation: "Ферментация",
  packaging: "Розлив",
  other: "Другое"
};

const sectionOrder = ["fermentable", "hop", "yeast", "water_prep", "misc"] as const;
type SectionCategory = (typeof sectionOrder)[number];

const sectionLabels: Record<SectionCategory, string> = {
  fermentable: "Сбраживаемое",
  hop: "Хмель",
  yeast: "Дрожжи",
  water_prep: "Водоподготовка",
  misc: "Прочее"
};

const sectionIcons: Record<SectionCategory, React.ComponentType<{ className?: string }>> = {
  fermentable: Wheat,
  hop: Hop,
  yeast: FlaskConical,
  water_prep: Droplets,
  misc: Package
};

const sectionIconBg: Record<SectionCategory, string> = {
  fermentable: "bg-amber-50 text-amber-600",
  hop: "bg-emerald-50 text-emerald-600",
  yeast: "bg-violet-50 text-violet-600",
  water_prep: "bg-sky-50 text-sky-600",
  misc: "bg-zinc-100 text-zinc-500"
};

const sectionAccentBorder: Record<SectionCategory, string> = {
  fermentable: "border-l-amber-400",
  hop: "border-l-emerald-500",
  yeast: "border-l-violet-400",
  water_prep: "border-l-sky-400",
  misc: "border-l-zinc-300"
};

const buildMetaLine = (ingredient: RecipeDetailDto["ingredients"][number]) => {
  const stepMeta = (ingredient.stepMeta ?? {}) as Record<string, unknown>;
  const parts = [stageLabel[ingredient.stage]];

  if (typeof stepMeta.useType === "string") {
    parts.push(stepMeta.useType.replaceAll("_", " "));
  }
  if (typeof stepMeta.use === "string" && stepMeta.use !== "mash") {
    parts.push(stepMeta.use);
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

export function RecipeIngredientsSection({ ingredients }: { ingredients: RecipeDetailDto["ingredients"] }) {
  const grouped = sectionOrder.map((category) => ({
    category,
    items: ingredients.filter((ingredient) => (ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type })) === category)
  }));

  return (
    <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-zinc-950">Ингредиенты</h2>
      {ingredients.length === 0 ? <p className="text-sm text-zinc-400">Ингредиенты пока не добавлены.</p> : null}
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
                <h3 className="text-sm font-semibold text-zinc-700">{sectionLabels[group.category]}</h3>
                <span className="text-xs tabular-nums text-zinc-400">({group.items.length})</span>
              </div>
              <ul className="space-y-1.5">
                {group.items.map((ingredient) => {
                  const { primaryName, secondaryName } = resolveIngredientDisplayNames({
                    displayName: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? ingredient.type,
                    displayNameRu: ingredient.ingredientDisplayNameRu,
                    displayNameEn: ingredient.ingredientDisplayNameEn
                  });

                  return (
                    <li key={ingredient.id} className={`rounded-lg border-l-[3px] bg-white px-3 py-2.5 ring-1 ring-zinc-100 ${accent}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-zinc-900">{primaryName}</div>
                          {secondaryName ? <div className="mt-0.5 text-xs text-zinc-500">{secondaryName}</div> : null}
                          <div className="mt-0.5 text-xs text-zinc-500">{buildMetaLine(ingredient)}</div>
                        </div>
                        <div className="shrink-0 text-right text-sm font-medium tabular-nums text-zinc-700">{formatInventoryQuantityForDisplay({
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
