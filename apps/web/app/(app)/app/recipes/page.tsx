import React, { Suspense } from "react";

import { MyRecipesContent } from "./content";
import { RecipesLoadingSkeleton } from "./loading";

export default function MyRecipesPage() {
  return (
    <Suspense fallback={<RecipesLoadingSkeleton />}>
      <MyRecipesContent />
    </Suspense>
  );
}
