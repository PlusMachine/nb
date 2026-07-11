import React from "react";
import { notFound } from "next/navigation";

import { LabelStudio } from "@/components/recipes/labels/label-studio";
import { getOwnedRecipeLabelContext } from "@/features/labels/service";
import { requireUser } from "@/lib/auth";

// «Наклейки» — генератор наклеек на бутылки из данных рецепта: поля
// подставляются автоматически, но каждое можно поправить. Только владельцу.

export default async function RecipeLabelsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  try {
    const { recipe, slots } = await getOwnedRecipeLabelContext(user.id, id);
    return (
      <LabelStudio
        endpoint={`/api/labels/${recipe.id}`}
        heading={`Наклейки — ${recipe.title}`}
        defaultSlots={slots}
        qrAvailable={recipe.publicationState === "published"}
        backLink={{ href: `/app/recipes/${recipe.id}/edit`, label: "К рецепту" }}
        resetLabel="Вернуть данные рецепта"
      />
    );
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }
}
