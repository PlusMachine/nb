import { NextResponse } from "next/server";

import { recipeImageVariantSchema } from "@/features/recipe-images/contracts";
import { getRecipeImageAsset } from "@/features/recipe-images/service";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ imageId: string; variant: string }> }
) {
  const { imageId, variant } = await context.params;
  const parsedVariant = recipeImageVariantSchema.safeParse(variant);

  if (!parsedVariant.success) {
    return NextResponse.json({ error: "INVALID_VARIANT" }, { status: 404 });
  }

  try {
    const user = await getSessionUser();
    const asset = await getRecipeImageAsset({
      imageId,
      variant: parsedVariant.data,
      viewerId: user?.id ?? null
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
