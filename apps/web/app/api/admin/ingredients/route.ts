import { NextResponse } from "next/server";

import { listCatalogIngredients, createIngredient } from "@/features/ingredients/service";
import { requireCatalogRole } from "@/features/ingredients/permissions";

export async function GET(request: Request) {
  try {
    await requireCatalogRole("admin");
    const { searchParams } = new URL(request.url);
    const result = await listCatalogIngredients({
      page: Number(searchParams.get("page") ?? "1"),
      pageSize: Number(searchParams.get("pageSize") ?? "20"),
      q: searchParams.get("q") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      status: (searchParams.get("status") as never) ?? undefined
    });
    return NextResponse.json(result);
  } catch (error) {
    const status = (error as Error).message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCatalogRole("admin");
    const body = await request.json();
    const item = await createIngredient(body, user.id);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    const status = (error as Error).message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}
