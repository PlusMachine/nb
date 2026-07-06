"use client";

import React from "react";
import type { BjcpCatalogStyle, ContentArticle } from "@nb/content";

import { useViewerGravityUnit } from "@/features/system/use-viewer-gravity-unit";

import { passportStatDefinitions, resolvePassportStat } from "./bjcp-article-page";
import { PassportStatCard } from "./bjcp-passport-stat-card";

/**
 * НП/КП карточки «паспорта» стиля — страница статьи полностью SSG, поэтому единица
 * плотности догружается на клиенте после гидрации (см. {@link useViewerGravityUnit}).
 * До ответа сервера показывается дефолт (Plato) — та же разметка, что и на сервере.
 */
export function BjcpGravityPassportStats({
  article,
  catalogStyle
}: {
  article: ContentArticle;
  catalogStyle: BjcpCatalogStyle | null;
}) {
  const { unit: preferredGravityUnit } = useViewerGravityUnit();

  const ogDefinition = passportStatDefinitions.find((definition) => definition.key === "og")!;
  const fgDefinition = passportStatDefinitions.find((definition) => definition.key === "fg")!;

  return (
    <>
      <PassportStatCard stat={resolvePassportStat(article, ogDefinition, catalogStyle, preferredGravityUnit)} />
      <PassportStatCard stat={resolvePassportStat(article, fgDefinition, catalogStyle, preferredGravityUnit)} />
    </>
  );
}
