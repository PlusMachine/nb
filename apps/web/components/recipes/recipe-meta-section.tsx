import React from "react";
import { FileText, StickyNote } from "lucide-react";
import type { RecipeDetailDto } from "@/features/recipes/contracts";

export function RecipeMetaSection({ recipe, showPrivateNotes = true }: { recipe: RecipeDetailDto; showPrivateNotes?: boolean }) {
  const hasDescription = Boolean(recipe.description?.trim());
  const hasNotes = Boolean(recipe.authorNotes?.trim());

  if (!hasDescription && (!showPrivateNotes || !hasNotes)) {
    return null;
  }

  return (
    <section className={`grid gap-4 ${showPrivateNotes ? "sm:grid-cols-2" : ""}`}>
      {hasDescription || !showPrivateNotes ? (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">Описание</h2>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{recipe.description || "Описание не заполнено."}</p>
        </div>
      ) : null}
      {showPrivateNotes ? (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-warning-subtle">
              <StickyNote className="h-3.5 w-3.5 text-warning-subtle-foreground" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">Личные заметки</h2>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{recipe.authorNotes || "Личных заметок пока нет."}</p>
        </div>
      ) : null}
    </section>
  );
}
