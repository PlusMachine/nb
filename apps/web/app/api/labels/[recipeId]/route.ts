import { assertRateLimit } from "@nb/auth";
import { NextResponse } from "next/server";

import { buildLabelFileName, labelOverridesSchema, labelRenderRequestSchema } from "@/features/labels/contracts";
import {
  renderA4SheetPdf,
  renderLabelPdf,
  renderLabelPng,
  renderLabelPreviewPng,
  resolveDescriptionPrintState,
  resolveQrPrintState
} from "@/features/labels/render";
import { getOwnedRecipeLabelContext } from "@/features/labels/service";
import { resolvePreferredGravityUnit } from "@/features/system/gravity-units";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

// Генератор наклеек: PNG (1-бит, точная пиксельная сетка под dpi) и PDF
// (точный физразмер / A4-лист). Доступ — только владелец рецепта.

export async function GET(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  const { recipeId } = await context.params;
  const url = new URL(request.url);
  const parsed = labelRenderRequestSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }
  const query = parsed.data;
  // A4-лист существует только как PDF.
  const format = query.sheet ? "pdf" : query.format;

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "AUTH" }, { status: 401 });
  }

  try {
    // Рендер = растеризация SVG (resvg + sharp), тяжёлая CPU-операция. Лимит
    // per-user; окно щедрое — превью перерисовывается на правку полей (с дебаунсом).
    await assertRateLimit(user.id, "label_render", 120, 5 * 60);
  } catch {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    // Правки полей приходят теми же query-параметрами; парсим их отдельной
    // схемой, чтобы не смешивать с параметрами рендера.
    const overrides = labelOverridesSchema.parse(Object.fromEntries(url.searchParams));
    const { recipe, slots } = await getOwnedRecipeLabelContext(user.id, recipeId, {
      bottlingDate: query.bottlingDate ?? null,
      gravityUnit: resolvePreferredGravityUnit(user.preferredGravityUnit),
      overrides
    });

    const renderParams = { template: query.template, preset: query.preset, dpi: query.dpi, slots };
    const body = query.sheet
      ? await renderA4SheetPdf(renderParams)
      : format === "pdf"
        ? await renderLabelPdf(renderParams)
        : query.preview
          ? await renderLabelPreviewPng(renderParams)
          : await renderLabelPng(renderParams);

    const fileName = buildLabelFileName({
      slug: recipe.slug,
      recipeId: recipe.id,
      preset: query.preset,
      sheet: query.sheet,
      dpi: query.dpi,
      format
    });

    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "image/png",
        "Content-Disposition": `${query.download ? "attachment" : "inline"}; filename="${fileName}"`,
        // Наклейка зависит от данных рецепта — не кешируем.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        // Молча исчезнувший QR читается как поломка — говорим студии правду.
        "X-Label-Qr": resolveQrPrintState(renderParams),
        // То же про описание: оно урезается по остатку высоты.
        "X-Label-Description": resolveDescriptionPrintState(renderParams)
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    console.error("label render failed", error);
    return NextResponse.json({ error: "LABEL_RENDER_FAILED" }, { status: 500 });
  }
}
