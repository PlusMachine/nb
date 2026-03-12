import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RecipeIngredientsSection } from "@/components/recipes/recipe-ingredients-section";
import { RecipeMetaSection } from "@/components/recipes/recipe-meta-section";
import { RecipeStatsSummary } from "@/components/recipes/recipe-stats-summary";
import { getRecipeById } from "@/features/recipes/service";
import { requireUser } from "@/lib/auth";

const statusLabel: Record<string, string> = {
  draft: "Черновик",
  private: "Приватный",
  published: "Опубликован"
};

const visibilityLabel: Record<string, string> = {
  private: "Только автор",
  public: "Публичный"
};

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  try {
    const recipe = await getRecipeById(user.id, id);

    return (
      <main className="space-y-4">
        <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-zinc-200 px-2 py-1 text-xs font-medium">{statusLabel[recipe.status]}</span>
            <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">{visibilityLabel[recipe.visibility]}</span>
          </div>
          <h1 className="text-2xl font-semibold text-zinc-950">{recipe.title}</h1>
          <p className="text-sm text-zinc-600">Объём партии: {recipe.batchSizeEnteredQuantity} {recipe.batchSizeEnteredUnit}</p>
          {recipe.authorId === user.id && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <Link href={`/app/recipes/${recipe.id}/edit`} className="text-sm font-medium text-blue-700 hover:text-blue-900">Редактировать рецепт</Link>
              {recipe.status === "published" && recipe.visibility === "public" && recipe.slug
                ? <Link href={`/recipes/${recipe.slug}`} className="text-sm font-medium text-emerald-700 hover:text-emerald-900">Открыть публичную страницу</Link>
                : null}
            </div>
          )}
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
