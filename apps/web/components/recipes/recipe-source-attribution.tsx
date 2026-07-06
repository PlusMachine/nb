import React from "react";

import { readRecipeSourceAttribution } from "@/features/recipes/contracts";

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

/**
 * Баннер первоисточника заимствованного/импортированного рецепта:
 * «Источник: «{площадка/ссылка}», автор {имя}» + строка происхождения. Рендерится
 * только если в `importMeta.sourceAttribution` есть ссылка или происхождение.
 * Внешняя ссылка открывается в новой вкладке с rel="nofollow noopener"; рендерим
 * её только для http(s)-URL (защита от javascript:-схем).
 */
export function RecipeSourceAttribution({
  importMeta
}: {
  importMeta: Record<string, unknown> | null | undefined;
}) {
  const source = readRecipeSourceAttribution(importMeta);
  if (!source) {
    return null;
  }

  const linkLabel = source.siteName?.trim() || source.url || "оригинал";
  const showLink = Boolean(source.url && isHttpUrl(source.url));

  return (
    <div className="rounded-xl border border-warning/30 bg-warning-subtle/60 px-3 py-2 text-xs text-muted-foreground">
      <p>
        Источник:{" "}
        {showLink ? (
          <a
            href={source.url ?? undefined}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-2"
          >
            {linkLabel}
          </a>
        ) : (
          <span className="font-medium text-foreground">{linkLabel}</span>
        )}
        {source.author ? <>, автор {source.author}</> : null}
      </p>
      {source.origin ? <p className="mt-1 leading-relaxed text-muted-foreground">{source.origin}</p> : null}
    </div>
  );
}
