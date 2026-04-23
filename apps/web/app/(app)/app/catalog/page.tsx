import React, { Suspense } from "react";

import { IngredientCatalogContent } from "./content";
import { CatalogLoadingSkeleton } from "./loading";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function IngredientCatalogPage(props: Props) {
  return (
    <Suspense fallback={<CatalogLoadingSkeleton />}>
      <IngredientCatalogContent {...props} />
    </Suspense>
  );
}
