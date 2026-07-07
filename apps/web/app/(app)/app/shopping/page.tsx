import React, { Suspense } from "react";

import { ShoppingListContent } from "./content";
import { ShoppingListSkeleton } from "./loading";

export const metadata = {
  title: "Чего не хватает"
};

export default function ShoppingListPage() {
  return (
    <Suspense fallback={<ShoppingListSkeleton />}>
      <ShoppingListContent />
    </Suspense>
  );
}
