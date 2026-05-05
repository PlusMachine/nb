import React from "react";

import { IngredientsPageSkeleton } from "@/components/app/section-skeletons";

export const IngredientsLoadingSkeleton = IngredientsPageSkeleton;

export default function IngredientsLoading() {
  return <IngredientsLoadingSkeleton />;
}
