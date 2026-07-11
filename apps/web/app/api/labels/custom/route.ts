import { NextResponse } from "next/server";

import { buildLabelFileName, labelOverridesSchema, labelRenderRequestSchema } from "@/features/labels/contracts";
import { checkLabelRenderRateLimit } from "@/features/labels/rate-limit";
import { renderA4SheetPdf, renderLabelPdf, renderLabelPng, renderLabelPreviewPng } from "@/features/labels/render";
import { buildCustomLabelSlots } from "@/features/labels/slots";

export const runtime = "nodejs";

// Наклейка без рецепта: все поля приходят из формы (/labels). Рецепта нет —
// значит нет ни владельца, ни QR: ссылаться не на что. Доступ без логина,
// поэтому поток растеризации ограничен per-IP.

const resolveClientIp = (request: Request): string => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = labelRenderRequestSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }
  const query = parsed.data;
  const format = query.sheet ? "pdf" : query.format;

  if (!checkLabelRenderRateLimit(resolveClientIp(request))) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    const overrides = labelOverridesSchema.parse(Object.fromEntries(url.searchParams));
    const slots = buildCustomLabelSlots({ bottlingDate: query.bottlingDate ?? null, overrides });

    const renderParams = { template: query.template, preset: query.preset, dpi: query.dpi, slots };
    const body = query.sheet
      ? await renderA4SheetPdf(renderParams)
      : format === "pdf"
        ? await renderLabelPdf(renderParams)
        : query.preview
          ? await renderLabelPreviewPng(renderParams)
          : await renderLabelPng(renderParams);

    const fileName = buildLabelFileName({
      slug: "naklejka",
      recipeId: "custom",
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
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("custom label render failed", error);
    return NextResponse.json({ error: "LABEL_RENDER_FAILED" }, { status: 500 });
  }
}
