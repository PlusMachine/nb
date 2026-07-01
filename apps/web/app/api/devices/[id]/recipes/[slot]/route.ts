import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getSlotSnapshot } from "@/features/devices/onboard-recipes";
import { mapDeviceError } from "@/features/devices/errors";

// =============================================================================
//  /api/devices/:id/recipes/:slot — read-only снапшот «что лежит на плате» в слоте
//  (Phase 4). Ownership-checked (сервис). Возвращает { recipe } (нативный
//  DeviceRecipe) либо { recipe: null } для пустого слота — НЕ 404, чтобы UI показал
//  «слот пуст» без обработки ошибки. По облаку транспорт бросает CLOUD_UNSUPPORTED
//  → 501 (снапшот доступен только LAN/через симулятор).
//
//  ЧЕСТНО: это просмотр «что на плате», а не импорт в каталог nb (DeviceRecipe
//  беднее модели рецепта nb — см. onboard-recipes / решение дизайна §5).
// =============================================================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; slot: string }> }
) {
  const user = await requireUser();
  const { id, slot } = await params;

  const slotNum = Number.parseInt(slot, 10);
  if (!Number.isInteger(slotNum) || slotNum < 0) {
    return NextResponse.json({ error: "INVALID_SLOT" }, { status: 400 });
  }

  try {
    const recipe = await getSlotSnapshot(user.id, id, slotNum);
    return NextResponse.json({ recipe });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "CLOUD_UNSUPPORTED") {
      return NextResponse.json(
        {
          error:
            "Чтение рецепта с платы доступно, когда портал в одной сети с устройством (LAN).",
          code: "CLOUD_UNSUPPORTED"
        },
        { status: 501 }
      );
    }
    const mapped = mapDeviceError(error);
    return NextResponse.json({ error: mapped.code }, { status: mapped.status });
  }
}
