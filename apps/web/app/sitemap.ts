import type { MetadataRoute } from "next";
import { listArticles } from "@nb/content";

import { allCalculatorSlugs } from "@/features/calculators/catalog";
import { listPublishedContentArticles } from "@/features/content-articles/service";
import { catalogCategoryLandings } from "@/features/ingredients/seo";
import { listCatalogSitemapEntries } from "@/features/ingredients/service";
import { listMasterSitemapEntries } from "@/features/masters/service";
import { listRecipeSitemapEntries } from "@/features/recipes/service";
import { getServerEnv } from "@/lib/env";

// Каталог/статьи меняются вне билда — перечитываем из БД раз в час, а не
// только на билде (иначе новые рецепты/статьи не попадают в sitemap до деплоя).
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { APP_URL } = getServerEnv();
  const [articles, catalogEntries, guides, recipeEntries, masterEntries] = await Promise.all([
    listArticles(),
    listCatalogSitemapEntries(),
    listPublishedContentArticles(),
    listRecipeSitemapEntries(),
    listMasterSitemapEntries()
  ]);

  // Публичные витринные разделы и правовые страницы. lastModified намеренно не
  // указываем: у этих путей нет честной даты изменения контента, а new Date()
  // в lastModified запрещён (краулеры перестают доверять датам).
  const staticPaths = [
    "",
    "/recipes",
    "/catalog",
    "/bjcp",
    "/calculators",
    "/articles",
    "/market",
    "/brewforge",
    "/demo",
    "/legal",
    "/legal/terms",
    "/legal/privacy",
    "/legal/consent",
    "/legal/cookies"
  ];

  return [
    ...staticPaths.map((path) => ({
      url: `${APP_URL}${path}`
    })),
    // BJCP-статьи: lastModified намеренно не отдаём — updatedAt здесь фиктивная
    // дата (см. resolvePublishedAt в packages/content/src/bjcp.ts), а не честная
    // дата ревизии контента.
    ...articles.map((article) => ({
      url: `${APP_URL}/bjcp/${article.slug}`
    })),
    // Опубликованные гайды/обзоры контент-CMS.
    ...guides.map((guide) => ({
      url: `${APP_URL}/articles/${guide.slug}`,
      lastModified: guide.updatedAt
    })),
    // Категорийные лендинги каталога (см. features/ingredients/seo.ts). Честной
    // даты изменения у статичного лендинга нет — lastModified не отдаём.
    ...catalogCategoryLandings.map((landing) => ({
      url: `${APP_URL}/catalog/${landing.slug}`
    })),
    // Деталки системных ингредиентов. Кастомные (пользовательские) в sitemap
    // не попадают никогда — их вообще нет в таблице ingredients.
    ...catalogEntries.map((entry) => ({
      url: `${APP_URL}/catalog/system/${entry.id}`,
      lastModified: entry.updatedAt
    })),
    // Опубликованные публичные рецепты.
    ...recipeEntries.map((entry) => ({
      url: `${APP_URL}/recipes/${entry.slug}`,
      lastModified: entry.updatedAt
    })),
    // Опубликованные и не снятые с витрины (isListed) профили мастеров.
    ...masterEntries.map((entry) => ({
      url: `${APP_URL}/masters/${entry.slug}`,
      lastModified: entry.publishedAt
    })),
    // Калькуляторы — статичные страницы без честной даты изменения.
    ...allCalculatorSlugs.map((slug) => ({
      url: `${APP_URL}/calculators/${slug}`
    }))
  ];
}
