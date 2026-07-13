import React from "react";
import Link from "next/link";

import type { RecipeCloneSourceDto } from "@/features/recipes/contracts";

/**
 * Баннер атрибуции копии: «Скопировано из «{название}», автор {имя}». Ссылка на
 * оригинал — только если источник опубликован. Не показываем, если источника нет
 * или это копия СВОЕГО рецепта (автор источника = владелец копии).
 */
export function RecipeCloneAttribution({
  clonedFrom,
  ownerAuthorId
}: {
  clonedFrom: RecipeCloneSourceDto | null | undefined;
  ownerAuthorId: string;
}) {
  if (!clonedFrom || clonedFrom.authorId === ownerAuthorId) {
    return null;
  }

  const authorName = clonedFrom.authorName?.trim() || "другой пивовар";

  return (
    <p className="rounded-xl border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
      Скопировано из{" "}
      {clonedFrom.isPublished ? (
        <Link
          href={`/recipes/${clonedFrom.slug}`}
          className="font-medium text-foreground underline underline-offset-2"
        >
          «{clonedFrom.title}»
        </Link>
      ) : (
        <span className="font-medium text-foreground">«{clonedFrom.title}»</span>
      )}
      , автор {authorName}
    </p>
  );
}
