import { assertRateLimit } from "@nb/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { LABEL_FIELD_LIMITS, parseRecipeSlugInput } from "@/features/labels/contracts";
import { recipeFieldsFromSlots } from "@/features/labels/recipe-fields";
import { buildLabelSlots } from "@/features/labels/slots";
import { getPublicRecipeBySlug } from "@/features/recipes/service";
import { isRecipePubliclyVisible } from "@/features/recipes/visibility";
import { defaultPreferredGravityUnit, preferredGravityUnits } from "@/features/system/gravity-units";
import { clientIpFrom } from "@/lib/anti-abuse";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

// Данные рецепта для формы студии (/labels → «Заполнить поля»). Отдаём ровно то,
// что и так печатается на наклейке публичного рецепта, — те же слоты, что и в
// рендере. Граница доступа та же, что у QR в этом же режиме: только публично
// видимый рецепт. Эндпоинт анонимный, поэтому черновики и скрытые модератором
// рецепты здесь недоступны даже автору (свой черновик человек оформляет в
// студии рецепта, где поля подставлены сразу).

const requestSchema = z.object({
  recipe: z.string().min(1).max(LABEL_FIELD_LIMITS.recipeSlug),
  gravityUnit: z.enum(preferredGravityUnits).optional()
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = requestSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }

  try {
    await assertRateLimit(`ip:${clientIpFrom(request) ?? "unknown"}`, "label_recipe_fields", 60, 5 * 60);
  } catch {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const { APP_URL } = getServerEnv();
  // В поле можно вписать и слаг, и ссылку — тот же разбор, что у цели QR.
  const slug = parseRecipeSlugInput(parsed.data.recipe, APP_URL);
  if (!slug) {
    return NextResponse.json({ error: "RECIPE_NOT_FOUND" }, { status: 404 });
  }

  try {
    const recipe = await getPublicRecipeBySlug(slug);
    if (!isRecipePubliclyVisible(recipe)) {
      return NextResponse.json({ error: "RECIPE_NOT_FOUND" }, { status: 404 });
    }

    const slots = buildLabelSlots({
      recipe,
      baseUrl: APP_URL,
      // Шкалу присылает студия: OG/FG должны приехать в той единице, в которой
      // поле сейчас печатается, иначе «12.0» из °P легло бы в поле, набранное в SG.
      gravityUnit: parsed.data.gravityUnit ?? defaultPreferredGravityUnit
    });

    return NextResponse.json(
      { slug, title: recipe.title, fields: recipeFieldsFromSlots(slots) },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    // Нет такого рецепта — форма показывает это сообщением, а не падает.
    return NextResponse.json({ error: "RECIPE_NOT_FOUND" }, { status: 404 });
  }
}
