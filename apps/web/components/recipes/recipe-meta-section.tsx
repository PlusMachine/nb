import React from "react";
import type { RecipeDetailDto } from "@/features/recipes/contracts";

export function RecipeMetaSection({ recipe }: { recipe: RecipeDetailDto }) {
  return (
    <section className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2">
      <div>
        <h2 className="text-sm font-medium text-zinc-500">Описание</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-900">{recipe.description || "Описание не заполнено."}</p>
      </div>
      <div>
        <h2 className="text-sm font-medium text-zinc-500">Заметки автора</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-900">{recipe.authorNotes || "Заметок пока нет."}</p>
      </div>
    </section>
  );
}
