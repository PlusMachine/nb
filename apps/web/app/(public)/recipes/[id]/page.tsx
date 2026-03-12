import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicRecipePage } from "@/components/recipes/public-recipe-page";
import { getPublicRecipeById } from "@/features/recipes/service";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;

  try {
    const recipe = await getPublicRecipeById(id);

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

export default async function PublicRecipeRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const recipe = await getPublicRecipeById(id);
    return <PublicRecipePage recipe={recipe} />;
  } catch (error) {
    if (error instanceof Error && ["NOT_FOUND", "FORBIDDEN"].includes(error.message)) {
      notFound();
    }

    throw error;
  }
}
