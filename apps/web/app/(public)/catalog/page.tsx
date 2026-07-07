import React from "react";
import type { Metadata } from "next";

import { IngredientCatalogContent, parseCategory, parsePage, parseSubtype } from "./content";
import { buildCatalogListMetadata } from "@/features/ingredients/seo";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const q = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : undefined;
  const view = typeof resolvedSearchParams.view === "string" ? resolvedSearchParams.view : undefined;
  const page = parsePage(typeof resolvedSearchParams.page === "string" ? resolvedSearchParams.page : undefined);
  const category = parseCategory(typeof resolvedSearchParams.category === "string" ? resolvedSearchParams.category : undefined);
  const subtype = parseSubtype(typeof resolvedSearchParams.subtype === "string" ? resolvedSearchParams.subtype : undefined);

  return buildCatalogListMetadata({ q, view, page, category, subtype });
}

// Без Suspense: IngredientCatalogContent зовёт notFound() при пагинации за
// диапазоном (page > totalPages) — под Suspense-границей стриминг успевает
// заголовки с 200 до броска notFound, и soft-404 всё равно уходит с 200.
export default async function IngredientCatalogPage(props: Props) {
  return <IngredientCatalogContent {...props} />;
}
