import { assertRateLimit } from "@nb/auth";
import { NextResponse } from "next/server";

import {
  buildLabelFileName,
  labelOverridesSchema,
  labelRenderRequestSchema,
  parseRecipeSlugInput
} from "@/features/labels/contracts";
import {
  renderA4SheetPdf,
  renderLabelPdf,
  renderLabelPng,
  renderLabelPreviewPng,
  resolveDescriptionPrintState,
  resolveQrPrintState
} from "@/features/labels/render";
import { buildCustomLabelSlots } from "@/features/labels/slots";
import { getPublicRecipeBySlug } from "@/features/recipes/service";
import { isRecipePubliclyVisible } from "@/features/recipes/visibility";
import { clientIpFrom } from "@/lib/anti-abuse";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

// Наклейка без рецепта: все поля приходят из формы (/labels). Владельца нет,
// поэтому доступ без логина, а поток растеризации ограничен per-IP.
// QR ведёт только на гостевую страницу пива нашего сайта (recipeSlug):
// печатать в QR произвольную ссылку нельзя — это превратило бы публичный
// эндпоинт в генератор QR на любой сайт под нашим брендом. И только для
// опубликованных: эндпоинт анонимный, share-ключи черновиков здесь не выдаём.

/** URL гостевой страницы пива для QR — только по существующему опубликованному слагу. */
const resolveRecipeQrUrl = async (input: string | undefined, baseUrl: string): Promise<string | null> => {
  if (!input) {
    return null;
  }
  const slug = parseRecipeSlugInput(input, baseUrl);
  if (!slug) {
    return null;
  }
  try {
    const recipe = await getPublicRecipeBySlug(slug);
    // getPublicRecipeBySlug отдаёт только публично видимые, но слот QR — печать:
    // проверяем видимость явно, а не полагаемся на выборку.
    if (!isRecipePubliclyVisible(recipe)) {
      return null;
    }
    return `${baseUrl.replace(/\/$/, "")}/beer/${slug}`;
  } catch {
    // Нет такого рецепта — QR просто не появится (форма не ломается).
    return null;
  }
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = labelRenderRequestSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }
  const query = parsed.data;
  const format = query.sheet ? "pdf" : query.format;

  try {
    // Анонимный рендер = растеризация SVG (CPU). Лимит per-IP через персистентный
    // счётчик; окно щедрое — превью перерисовывается на правку полей (с дебаунсом).
    await assertRateLimit(`ip:${clientIpFrom(request) ?? "unknown"}`, "label_render_custom", 240, 5 * 60);
  } catch {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    const overrides = labelOverridesSchema.parse(Object.fromEntries(url.searchParams));
    const { APP_URL } = getServerEnv();
    const recipeQrUrl = overrides.qr === "0" ? null : await resolveRecipeQrUrl(overrides.recipeSlug, APP_URL);
    const slots = buildCustomLabelSlots({ bottlingDate: query.bottlingDate ?? null, overrides, recipeQrUrl });

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
        "X-Content-Type-Options": "nosniff",
        // Молча исчезнувший QR читается как поломка — говорим студии правду.
        "X-Label-Qr": resolveQrPrintState(renderParams),
        // То же про описание: оно урезается по остатку высоты.
        "X-Label-Description": resolveDescriptionPrintState(renderParams)
      }
    });
  } catch (error) {
    console.error("custom label render failed", error);
    return NextResponse.json({ error: "LABEL_RENDER_FAILED" }, { status: 500 });
  }
}
