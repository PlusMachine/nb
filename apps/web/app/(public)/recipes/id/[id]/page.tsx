import { notFound, permanentRedirect } from "next/navigation";

import { getPublicRecipeById } from "@/features/recipes/service";

export default async function LegacyPublicRecipeByIdRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const recipe = await getPublicRecipeById(id);
    // 308: легаси /recipes/id/<id> перманентно уступает канонический /recipes/<slug>
    // (внутренних ссылок на этот роут нет).
    permanentRedirect(`/recipes/${recipe.slug}`);
  } catch (error) {
    if (error instanceof Error && ["NOT_FOUND", "FORBIDDEN"].includes(error.message)) {
      notFound();
    }

    throw error;
  }
}
