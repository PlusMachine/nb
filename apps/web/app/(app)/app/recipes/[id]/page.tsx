import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { styleRangeFixtures } from "@nb/brewing-core";
import { ExternalLink, Pencil } from "lucide-react";

import { CloneRecipeButton } from "@/components/recipes/clone-recipe-button";
import { RecipeIngredientsSection } from "@/components/recipes/recipe-ingredients-section";
import { RecipeMetaSection } from "@/components/recipes/recipe-meta-section";
import { RecipeStatsSummary } from "@/components/recipes/recipe-stats-summary";
import { recipePublicationStateLabels } from "@/features/recipes/contracts";
import { formatUpdatedLabel } from "@/features/recipes/format";
import { getRecipeById } from "@/features/recipes/service";
import { requireUser } from "@/lib/auth";

const publicationStateBadge: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200",
  published: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  archived: "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
};

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  try {
    const recipe = await getRecipeById(user.id, id);
    const styleName = recipe.styleId ? styleRangeFixtures.find((s) => s.id === recipe.styleId)?.name ?? null : null;

    return (
      <main className="space-y-4">
        <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${publicationStateBadge[recipe.publicationState] ?? publicationStateBadge.draft}`}>
                  {recipePublicationStateLabels[recipe.publicationState]}
                </span>
                {styleName ? (
                  <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
                    {styleName}
                  </span>
                ) : null}
                <span className="text-xs text-zinc-400">{formatUpdatedLabel(recipe.updatedAt)}</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950">{recipe.title}</h1>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-lg bg-zinc-50 px-2.5 py-1 text-xs font-medium tabular-nums text-zinc-600 ring-1 ring-zinc-100">
                  {recipe.batchSizeEnteredQuantity} {recipe.batchSizeEnteredUnit}
                </span>
                <span className="rounded-lg bg-zinc-50 px-2.5 py-1 text-xs font-medium tabular-nums text-zinc-600 ring-1 ring-zinc-100">
                  {recipe.boilTimeMinutes} мин кипячения
                </span>
                {recipe.efficiency != null ? (
                  <span className="rounded-lg bg-zinc-50 px-2.5 py-1 text-xs font-medium tabular-nums text-zinc-600 ring-1 ring-zinc-100">
                    {recipe.efficiency}% эффект.
                  </span>
                ) : null}
              </div>
            </div>
            {recipe.authorId === user.id ? (
              <div className="flex shrink-0 gap-1.5">
                <Link href={`/app/recipes/${recipe.id}/edit`} className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800">
                  <Pencil className="h-3.5 w-3.5" />
                  Редактировать
                </Link>
                <CloneRecipeButton recipeId={recipe.id} />
                {recipe.publicationState === "published" && recipe.slug ? (
                  <Link href={`/recipes/${recipe.slug}`} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 ring-1 ring-zinc-200 transition-colors hover:bg-zinc-50">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Публичная
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <RecipeStatsSummary recipe={recipe} />
        <RecipeIngredientsSection ingredients={recipe.ingredients} />
        <RecipeMetaSection recipe={recipe} />
      </main>
    );
  } catch (error) {
    if (error instanceof Error && ["NOT_FOUND", "FORBIDDEN"].includes(error.message)) {
      notFound();
    }

    throw error;
  }
}
