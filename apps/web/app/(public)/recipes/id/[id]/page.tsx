import { notFound, redirect } from "next/navigation";

import { getPublicRecipeById } from "@/features/recipes/service";

export default async function LegacyPublicRecipeByIdRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const recipe = await getPublicRecipeById(id);
    redirect(`/recipes/${recipe.slug}`);
  } catch (error) {
    if (error instanceof Error && ["NOT_FOUND", "FORBIDDEN"].includes(error.message)) {
      notFound();
    }

    throw error;
  }
}
