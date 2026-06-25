import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicRecipePage } from "@/components/recipes/public-recipe-page";
import { getPublicRecipeBySlug } from "@/features/recipes/service";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;

  try {
    const recipe = await getPublicRecipeBySlug(slug);

    return {
      title: `${recipe.title} · Рецепт`,
      description: recipe.description ?? "Публичный рецепт домашнего пивоварения"
    };
  } catch {
    return {
      title: "Рецепт не найден",
      description: "Публичный рецепт недоступен."
    };
  }
}

export default async function PublicRecipeRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const recipe = await getPublicRecipeBySlug(slug);
    // Документ НЕ читает сессию/cookie → остаётся кэшируемым (ISR/static) для анонимов.
    // Персональная оценка тянется клиентом (recipe-rating-form) после гидрации.
    return <PublicRecipePage recipe={recipe} />;
  } catch (error) {
    if (error instanceof Error && ["NOT_FOUND", "FORBIDDEN"].includes(error.message)) {
      notFound();
    }

    throw error;
  }
}
