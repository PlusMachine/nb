import React, { Suspense } from "react";

import { MyRecipesContent } from "./content";
import { RecipesLoadingSkeleton } from "./loading";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function MyRecipesPage(props: Props) {
  return (
    <Suspense fallback={<RecipesLoadingSkeleton />}>
      <MyRecipesContent {...props} />
    </Suspense>
  );
}
