import React from "react";

import type { PublicRecipeListItem } from "@/features/recipes/contracts";

import { RecipesGrid } from "./recipes-grid";

/**
 * Похожие рецепты того же стиля — перелинковка на детальной странице (M8, P2
 * аудита). Данные резолвит `[slug]/page.tsx` через `listPublicRecipesForStyle`
 * (try/catch, пустой список — не блокирует билд/рендер без БД). Настоящие
 * `<Link>` внутри {@link RecipesGrid} рендерятся в серверном HTML.
 */
export function SimilarRecipesSection({ recipes }: { recipes: PublicRecipeListItem[] }) {
  if (!recipes.length) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Похожие рецепты</h2>
      <RecipesGrid recipes={recipes} view="grid" />
    </section>
  );
}
