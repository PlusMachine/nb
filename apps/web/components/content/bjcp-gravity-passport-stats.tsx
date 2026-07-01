"use client";

import React, { useEffect, useState } from "react";
import type { BjcpCatalogStyle, ContentArticle } from "@nb/content";

import { loadViewerPreferredGravityUnit } from "@/features/system/gravity-unit-actions";
import { defaultPreferredGravityUnit } from "@/features/system/gravity-units";

import { passportStatDefinitions, resolvePassportStat } from "./bjcp-article-page";
import { PassportStatCard } from "./bjcp-passport-stat-card";

/**
 * НП/КП карточки «паспорта» стиля — страница статьи полностью SSG, поэтому единица
 * плотности догружается на клиенте после гидрации (как {@link RecipeRatingForm}).
 * До ответа сервера показывается дефолт (Plato) — та же разметка, что и на сервере.
 */
export function BjcpGravityPassportStats({
  article,
  catalogStyle
}: {
  article: ContentArticle;
  catalogStyle: BjcpCatalogStyle | null;
}) {
  const [preferredGravityUnit, setPreferredGravityUnit] = useState(defaultPreferredGravityUnit);

  useEffect(() => {
    let active = true;
    loadViewerPreferredGravityUnit()
      .then((unit) => {
        if (active) {
          setPreferredGravityUnit(unit);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const ogDefinition = passportStatDefinitions.find((definition) => definition.key === "og")!;
  const fgDefinition = passportStatDefinitions.find((definition) => definition.key === "fg")!;

  return (
    <>
      <PassportStatCard stat={resolvePassportStat(article, ogDefinition, catalogStyle, preferredGravityUnit)} />
      <PassportStatCard stat={resolvePassportStat(article, fgDefinition, catalogStyle, preferredGravityUnit)} />
    </>
  );
}
