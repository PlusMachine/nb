import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import {
  ingredientCatalogSortOptions,
  ingredientCategories,
  type IngredientCatalogSortOption,
  type IngredientCategory
} from "@/features/ingredients/contracts";
import {
  listUserCatalogIngredients,
  toIngredientSuggestionItem
} from "@/features/ingredients/catalog-service";

export async function GET(request: Request) {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);
  const parsedLimit = Number(searchParams.get("limit") ?? "30");
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 30;
  const rawCategory = searchParams.get("category") ?? undefined;
  const rawSubtype = searchParams.get("subtype") ?? undefined;
  const rawSort = searchParams.get("sort") ?? undefined;
  const category = ingredientCategories.includes(rawCategory as IngredientCategory)
    ? rawCategory as IngredientCategory
    : undefined;
  const subtype = rawSubtype === "malt" || rawSubtype === "fermentable"
    ? rawSubtype
    : undefined;
  const sort = ingredientCatalogSortOptions.includes(rawSort as IngredientCatalogSortOption)
    ? rawSort as IngredientCatalogSortOption
    : undefined;

  try {
    const result = await listUserCatalogIngredients(user.id, {
      view: "mine",
      q: searchParams.get("q") ?? undefined,
      category,
      subtype,
      sort,
      page: 1,
      pageSize: limit
    });

    return NextResponse.json({
      items: result.items.map((item) => toIngredientSuggestionItem(item)),
      total: result.total
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
