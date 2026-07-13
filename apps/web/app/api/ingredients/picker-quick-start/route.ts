import { assertRateLimit } from "@nb/auth";
import { NextResponse } from "next/server";

import { listIngredientPickerQuickStart } from "@/features/ingredients/catalog-service";
import type { IngredientCategory, UserIngredientReference } from "@/features/ingredients/contracts";
import { clientIpFrom } from "@/lib/anti-abuse";
import { getSessionUser } from "@/lib/auth";

// Каталог ингредиентов — публичная зона (см. /catalog): анонимный посетитель получает
// системный quick-start без избранного/недавних/кастомных. Нужно калькуляторам
// (напр. brewhouse-efficiency), которые используют пикер вне залогиненной зоны.
export async function POST(request: Request) {
  const user = await getSessionUser();

  // Каждый запрос грузит каталог и ранжирует в памяти (CPU); аноним — ключ по IP,
  // залогиненный — по юзеру. Окно щедрое (пикер дёргает на открытие/ввод).
  try {
    await assertRateLimit(user ? `user:${user.id}` : `ip:${clientIpFrom(request) ?? "unknown"}`, "ingredient_search", 120, 60);
  } catch {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    const body = await request.json() as {
      category?: string;
      subtype?: string | null;
      recentReferences?: unknown[];
      recentLimit?: number;
    };
    const result = await listIngredientPickerQuickStart(user?.id ?? null, {
      category: body.category as IngredientCategory,
      subtype: body.subtype === "malt" || body.subtype === "fermentable" ? body.subtype : null,
      recentReferences: Array.isArray(body.recentReferences) ? body.recentReferences as UserIngredientReference[] : undefined,
      recentLimit: body.recentLimit
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
