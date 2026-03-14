import React from "react";
import type { RecipeDetailDto } from "@/features/recipes/contracts";

export function RecipeMetaSection({ recipe, showPrivateNotes = true }: { recipe: RecipeDetailDto; showPrivateNotes?: boolean }) {
  return (
    <section className={`grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 ${showPrivateNotes ? "sm:grid-cols-2" : ""}`}>
      <div>
        <h2 className="text-sm font-medium text-zinc-500">Описание рецепта</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-900">{recipe.description || "Описание не заполнено."}</p>
      </div>
      {showPrivateNotes ? (
        <div>
          <h2 className="text-sm font-medium text-zinc-500">Личные заметки</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-900">{recipe.authorNotes || "Личных заметок пока нет."}</p>
        </div>
      ) : null}
    </section>
  );
}
