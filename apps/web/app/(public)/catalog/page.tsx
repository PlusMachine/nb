import React, { Suspense } from "react";
import type { Metadata } from "next";

import { IngredientCatalogContent, parseCategory, parsePage, parseSubtype } from "./content";
import { CatalogPageSkeleton } from "@/components/app/section-skeletons";
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

export default function IngredientCatalogPage(props: Props) {
  return (
    <Suspense fallback={<CatalogPageSkeleton />}>
      <IngredientCatalogContent {...props} />
    </Suspense>
  );
}
