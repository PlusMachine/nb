import { NextResponse } from "next/server";

import { listPublicRecipesForStyle } from "@/features/recipes/service";

// Публичный read-only эндпоинт: топ опубликованных рецептов сообщества в BJCP-стиле.
// Питает дата-остров «Рецепты в стиле „…“» на статической странице `/bjcp/[slug]`
// (сама страница остаётся SSG и не трогает БД на билде — данные тянутся тут, в
// рантайме). Отдаёт только published-рецепты (см. searchPublicRecipes).
//
// GET /api/recipes/by-style?style=<bjcpId>&limit=<1..12>
//   → { items: PublicRecipeListItem[]; total: number }

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 12;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const styleCode = searchParams.get("style")?.trim();

  if (!styleCode) {
    return NextResponse.json({ error: "MISSING_STYLE" }, { status: 400 });
  }

  const rawLimit = Number(searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const { items, total } = await listPublicRecipesForStyle(styleCode, limit);
  return NextResponse.json({ items, total });
}
