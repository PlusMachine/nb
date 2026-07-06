import type { MetadataRoute } from "next";
import { listArticles } from "@nb/content";

import { listPublishedContentArticles } from "@/features/content-articles/service";
import { catalogCategoryLandings } from "@/features/ingredients/seo";
import { listCatalogSitemapEntries } from "@/features/ingredients/service";
import { getServerEnv } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { APP_URL } = getServerEnv();
  const [articles, catalogEntries, guides] = await Promise.all([
    listArticles(),
    listCatalogSitemapEntries(),
    listPublishedContentArticles()
  ]);
  const now = new Date();

  // Публичные витринные разделы и правовые страницы.
  const staticPaths = [
    "",
    "/recipes",
    "/catalog",
    "/bjcp",
    "/calculators",
    "/articles",
    "/legal",
    "/legal/terms",
    "/legal/privacy",
    "/legal/consent",
    "/legal/cookies"
  ];

  return [
    ...staticPaths.map((path) => ({
      url: `${APP_URL}${path}`,
      lastModified: now
    })),
    ...articles.map((article) => ({
      url: `${APP_URL}/bjcp/${article.slug}`,
      lastModified: new Date(article.updatedAt)
    })),
    // Опубликованные гайды/обзоры контент-CMS.
    ...guides.map((guide) => ({
      url: `${APP_URL}/articles/${guide.slug}`,
      lastModified: guide.updatedAt
    })),
    // Категорийные лендинги каталога (см. features/ingredients/seo.ts).
    ...catalogCategoryLandings.map((landing) => ({
      url: `${APP_URL}/catalog/${landing.slug}`,
      lastModified: now
    })),
    // Деталки системных ингредиентов. Кастомные (пользовательские) в sitemap
    // не попадают никогда — их вообще нет в таблице ingredients.
    ...catalogEntries.map((entry) => ({
      url: `${APP_URL}/catalog/system/${entry.id}`,
      lastModified: entry.updatedAt
    }))
  ];
}
