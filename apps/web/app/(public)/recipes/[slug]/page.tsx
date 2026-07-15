import React, { cache } from "react";
import type { Metadata } from "next";
import { getBeerStyleById } from "@nb/brewing-core";
import { notFound } from "next/navigation";

import { PublicRecipePage } from "@/components/recipes/public-recipe-page";
import { jsonLdScriptProps } from "@/features/ingredients/seo";
import type { PublicRecipeListItem } from "@/features/recipes/contracts";
import { buildPublicRecipeMetadata, buildRecipeBreadcrumbJsonLd, buildRecipeJsonLd } from "@/features/recipes/seo";
import { getPublicRecipeBySlug, listPublicRecipesForStyle } from "@/features/recipes/service";
import { getServerEnv } from "@/lib/env";

// TTL-страховка (P2 аудита): правки рецепта уже дёргают revalidatePath точечно,
// но это не покрывает побочные пути (например, изменение стиля BJCP или смену
// денормализованного рейтинга фоновым job'ом) — 5 минут отдаём как фолбэк,
// чтобы устаревшая страница не жила бесконечно, если revalidatePath не сработал.
export const revalidate = 300;

// Дедуп запроса в пределах одного рендера: generateMetadata и сам компонент
// делят один SELECT рецепта (см. паттерн в app/(public)/articles/[slug]/page.tsx).
const loadRecipe = cache((slug: string) => getPublicRecipeBySlug(slug));

/**
 * «Похожие рецепты» того же стиля — перелинковка (M8, P2 аудита). try/catch
 * обязателен по тому же поводу, что и `loadStyleRecipes` в `bjcp/[slug]/page.tsx`:
 * билд не должен падать, если БД недоступна.
 */
const loadSimilarRecipes = async (styleCode: string | null, excludeSlug: string): Promise<PublicRecipeListItem[]> => {
  if (!styleCode) {
    return [];
  }

  try {
    const { items } = await listPublicRecipesForStyle(styleCode, 5);
    return items.filter((item) => item.slug !== excludeSlug).slice(0, 4);
  } catch {
    return [];
  }
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;

  try {
    const recipe = await loadRecipe(slug);
    const style = getBeerStyleById(recipe.styleId);
    return buildPublicRecipeMetadata(recipe, style);
  } catch (error) {
    // notFound()/rethrow именно здесь, в generateMetadata — иначе стриминг тела
    // успеет отдать 200 (через loading.tsx) до того, как решится статус страницы
    // для снятого с публикации/удалённого рецепта.
    if (error instanceof Error && ["NOT_FOUND", "FORBIDDEN"].includes(error.message)) {
      notFound();
    }

    throw error;
  }
}

export default async function PublicRecipeRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const recipe = await loadRecipe(slug);
    const style = getBeerStyleById(recipe.styleId);
    const { APP_URL } = getServerEnv();
    const recipeJsonLd = buildRecipeJsonLd(recipe, style, { baseUrl: APP_URL });
    const breadcrumbJsonLd = buildRecipeBreadcrumbJsonLd(recipe, { baseUrl: APP_URL });
    const similarRecipes = await loadSimilarRecipes(style?.bjcpId ?? null, recipe.slug);

    // Документ НЕ читает searchParams/сессию/cookie → остаётся кэшируемым (ISR/static)
    // для анонимов. Персональная оценка тянется клиентом (recipe-rating-form) после
    // гидрации; автооткрытие «Сварить» по ?brew=1 — тоже клиентом (brew-recipe-button.tsx).
    return (
      <>
        <PublicRecipePage recipe={recipe} similarRecipes={similarRecipes} />
        <script {...jsonLdScriptProps(recipeJsonLd)} />
        <script {...jsonLdScriptProps(breadcrumbJsonLd)} />
      </>
    );
  } catch (error) {
    if (error instanceof Error && ["NOT_FOUND", "FORBIDDEN"].includes(error.message)) {
      notFound();
    }

    throw error;
  }
}
