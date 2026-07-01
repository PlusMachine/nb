import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { getOnboardRecipes, pushRecipeToSlot } from "@/features/devices/onboard-recipes";
import { mapDeviceError } from "@/features/devices/errors";

// =============================================================================
//  /api/devices/:id/recipes — «рецепты на борту» (Phase 4).
//  Ownership-checked (requireUser → getDeviceById по userId в сервисе).
//
//  GET  → getOnboardRecipes: список слотов устройства (что на плате) + привязки
//         слот↔recipeId (device_recipe_slots) → { slots }.
//  POST → pushRecipeToSlot: пуш nb-рецепта НА плату в целевой слот с привязкой.
//         Тело: { recipeId: uuid, slot?: number } → { slot, boundRecipeId, boundRecipeName }.
//
//  listSlots/чтение слотов доступны LAN/через симулятор; по облаку транспорт
//  бросает CLOUD_UNSUPPORTED → отдаём 501 с понятным кодом (пуш по облаку работает,
//  но перечень слотов — нет; см. cloud-transport).
// =============================================================================

const pushBodySchema = z.object({
  recipeId: z.string().uuid(),
  slot: z.number().int().min(0).optional()
});

/** CLOUD_UNSUPPORTED — операция недоступна по облачному пути (только LAN/sim). */
function handleUnsupported(error: unknown): NextResponse | null {
  const code = error instanceof Error ? error.message : "";
  if (code === "CLOUD_UNSUPPORTED") {
    return NextResponse.json(
      {
        error:
          "Список рецептов на борту доступен, когда портал в одной сети с устройством (LAN). По облаку он пока недоступен.",
        code: "CLOUD_UNSUPPORTED"
      },
      { status: 501 }
    );
  }
  return null;
}

// GET /api/devices/:id/recipes — слоты + привязки.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  try {
    const slots = await getOnboardRecipes(user.id, id);
    return NextResponse.json({ slots });
  } catch (error) {
    const unsupported = handleUnsupported(error);
    if (unsupported) return unsupported;
    const { status, code } = mapDeviceError(error);
    return NextResponse.json({ error: code }, { status });
  }
}

// POST /api/devices/:id/recipes — пуш nb-рецепта на слот.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  try {
    const body = await request.json().catch(() => null);
    const parsed = pushBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const result = await pushRecipeToSlot(user.id, id, parsed.data.recipeId, parsed.data.slot);
    return NextResponse.json(result);
  } catch (error) {
    const unsupported = handleUnsupported(error);
    if (unsupported) return unsupported;
    const { status, code } = mapDeviceError(error);
    return NextResponse.json({ error: code }, { status });
  }
}
