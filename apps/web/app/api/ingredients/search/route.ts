import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { searchUserCatalogIngredients } from "@/features/ingredients/catalog-service";

// Каталог ингредиентов — публичная зона (см. /catalog): анонимный посетитель получает
// системный каталог без избранного/кастомных ингредиентов. Нужно калькуляторам
// (напр. brewhouse-efficiency), которые используют пикер вне залогиненной зоны.
export async function GET(request: Request) {
  const user = await getSessionUser();
  const { searchParams } = new URL(request.url);

  try {
    const result = await searchUserCatalogIngredients(user?.id ?? null, {
      q: searchParams.get("q") ?? "",
      type: searchParams.get("type") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      subtype: searchParams.get("subtype") ?? undefined,
      family: searchParams.get("family") ?? undefined,
      group: searchParams.get("group") ?? undefined,
      manufacturer: searchParams.get("manufacturer") ?? undefined,
      favoritesOnly: searchParams.get("favoritesOnly") === "true",
      customOnly: searchParams.get("customOnly") === "true",
      limit: Number(searchParams.get("limit") ?? "10"),
      includeCustom: searchParams.get("includeCustom") !== "false"
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
