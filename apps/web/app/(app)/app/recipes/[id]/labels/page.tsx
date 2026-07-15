import React, { Suspense } from "react";
import { notFound } from "next/navigation";

import { LabelStudio } from "@/components/recipes/labels/label-studio";
import { getOwnedRecipeLabelContext } from "@/features/labels/service";
import { resolvePreferredGravityUnit } from "@/features/system/gravity-units";
import { requireUser } from "@/lib/auth";

// «Наклейки» — генератор наклеек на бутылки из данных рецепта: поля
// подставляются автоматически, но каждое можно поправить. Только владельцу.

export default async function RecipeLabelsPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ batchId?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { batchId } = (await searchParams) ?? {};

  try {
    const gravityUnit = resolvePreferredGravityUnit(user.preferredGravityUnit);
    const { recipe, slots } = await getOwnedRecipeLabelContext(user.id, id, { gravityUnit });
    // Со страницы партии наклейки открывают ради КОНКРЕТНОЙ варки — «Назад»
    // должен вести туда же, а не в редактор рецепта (рецепт мог уйти вперёд).
    const backLink = batchId
      ? { href: `/app/brew-batches/${batchId}`, label: "К партии" }
      : { href: `/app/recipes/${recipe.id}/edit`, label: "К рецепту" };
    return (
      <Suspense fallback={null}>
        <LabelStudio
          endpoint={`/api/labels/${recipe.id}`}
          heading={`Наклейки — ${recipe.title}`}
          defaultSlots={slots}
          gravityUnit={gravityUnit}
          backLink={backLink}
          resetLabel="Вернуть данные рецепта"
        />
      </Suspense>
    );
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }
}
