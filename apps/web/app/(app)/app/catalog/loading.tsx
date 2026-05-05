import React from "react";

import { CatalogPageSkeleton } from "@/components/app/section-skeletons";

export const CatalogLoadingSkeleton = CatalogPageSkeleton;

export default function CatalogLoading() {
  return <CatalogLoadingSkeleton />;
}
