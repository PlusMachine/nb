import React, { Suspense } from "react";

import { MyIngredientsContent } from "./content";
import { IngredientsLoadingSkeleton } from "./loading";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function MyIngredientsPage(props: Props) {
  return (
    <Suspense fallback={<IngredientsLoadingSkeleton />}>
      <MyIngredientsContent {...props} />
    </Suspense>
  );
}
