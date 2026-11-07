import React from "react";

import { MyIngredientsContent } from "./content";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function MyIngredientsPage(props: Props) {
  // loading.tsx already provides the route's Suspense boundary. A second,
  // unkeyed boundary can restore a stale search branch from the router cache.
  return <MyIngredientsContent {...props} />;
}
