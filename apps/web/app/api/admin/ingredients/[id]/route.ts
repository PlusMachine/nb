import { NextResponse } from "next/server";

import { deleteIngredient, getIngredientById, updateIngredient } from "@/features/ingredients/service";
import { requireCatalogRole } from "@/features/ingredients/permissions";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireCatalogRole("admin");
    const { id } = await params;
    const item = await getIngredientById(id);
    if (!item) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error) {
    const status = (error as Error).message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCatalogRole("admin");
    const body = await request.json();
    const { id } = await params;
    const item = await updateIngredient(id, body, user.id);
    if (!item) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error) {
    const status = (error as Error).message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCatalogRole("admin");
    const { id } = await params;
    const result = await deleteIngredient(id, user.id);
    if (!result) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const status = (error as Error).message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}
