import React from "react";

import { RecipesPageSkeleton } from "@/components/app/section-skeletons";

export const RecipesLoadingSkeleton = RecipesPageSkeleton;

export default function RecipesLoading() {
  return <RecipesLoadingSkeleton />;
}
