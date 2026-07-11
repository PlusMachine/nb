import { NextResponse } from "next/server";
import { z } from "zod";

import { masterImageVariantSchema } from "@/features/masters/contracts";
import { getMasterImageAsset } from "@/features/masters/service";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

// imageId идёт напрямую в drizzle eq(masterImages.id, imageId) → мусорный uuid
// роняет Postgres с 22P02 (invalid input syntax for uuid), это ловится общим
// catch как 500 IMAGE_FETCH_FAILED. Роут публичный (краулеры, битые ссылки) —
// валидируем формат до похода в сервис, как уже делается для невалидного variant.
const masterImageIdSchema = z.string().uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ imageId: string; variant: string }> }
) {
  const { imageId, variant } = await context.params;
  const parsedVariant = masterImageVariantSchema.safeParse(variant);

  if (!parsedVariant.success) {
    return NextResponse.json({ error: "INVALID_VARIANT" }, { status: 404 });
  }

  if (!masterImageIdSchema.safeParse(imageId).success) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const user = await getSessionUser();
    const asset = await getMasterImageAsset({
      imageId,
      variant: parsedVariant.data,
      viewer: user ? { id: user.id, role: user.role } : null
    });

    return new NextResponse(new Uint8Array(asset.body), {
      status: 200,
      headers: {
        "Content-Type": asset.contentType,
        "Cache-Control": asset.cacheControl,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if (error instanceof Error && ["NOT_FOUND", "FORBIDDEN"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ error: "IMAGE_FETCH_FAILED" }, { status: 500 });
  }
}
