import React from "react";

import { ShoppingListView } from "@/components/shopping/shopping-list-view";
import { buildShoppingListForUser } from "@/features/shopping/service";
import { requireUser } from "@/lib/auth";

export async function ShoppingListContent() {
  const user = await requireUser();
  const list = await buildShoppingListForUser(user.id);

  return <ShoppingListView list={list} />;
}
