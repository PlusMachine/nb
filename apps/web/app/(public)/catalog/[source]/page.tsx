import React, { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IngredientCatalogContent, parsePage } from "../content";
import { CatalogPageSkeleton } from "@/components/app/section-skeletons";
import { buildCatalogListMetadata, resolveCatalogLanding } from "@/features/ingredients/seo";

// Категорийный лендинг каталога (path-урл): /catalog/hops, /catalog/malts и т.п.
// `source` здесь трактуется не как system|custom (это соседний [source]/[id]),
// а как слаг лендинга из catalogCategoryLandings — см. notes/catalog-refactor-plan.md, этап 1.4.
// Next.js не позволяет завести отдельный [categorySlug] рядом с [source], поэтому
// оба маршрута используют один и тот же динамический сегмент на разной глубине.

type Props = {
  params: Promise<{ source: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { source } = await params;
  const landing = resolveCatalogLanding(source);
  if (!landing) {
    // notFound именно здесь: generateMetadata выполняется до начала стриминга,
    // поэтому ответ получает настоящий 404-статус, а не мягкий 200+noindex.
    notFound();
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const q = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : undefined;
  const view = typeof resolvedSearchParams.view === "string" ? resolvedSearchParams.view : undefined;
  const page = parsePage(typeof resolvedSearchParams.page === "string" ? resolvedSearchParams.page : undefined);

  return buildCatalogListMetadata({ landing, q, view, page });
}

export default async function CatalogCategoryLandingPage({ params, searchParams }: Props) {
  const { source } = await params;
  const landing = resolveCatalogLanding(source);

  if (!landing) {
    notFound();
  }

  return (
    <Suspense fallback={<CatalogPageSkeleton />}>
      <IngredientCatalogContent searchParams={searchParams} landing={landing} />
    </Suspense>
  );
}
