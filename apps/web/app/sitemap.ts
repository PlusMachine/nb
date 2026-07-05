import type { MetadataRoute } from "next";
import { listArticles } from "@nb/content";

import { catalogCategoryLandings } from "@/features/ingredients/seo";
import { listCatalogSitemapEntries } from "@/features/ingredients/service";
import { getServerEnv } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { APP_URL } = getServerEnv();
  const [articles, catalogEntries] = await Promise.all([
    listArticles(),
    listCatalogSitemapEntries()
  ]);
  const now = new Date();

  // Публичные витринные разделы и правовые страницы.
  const staticPaths = [
    "",
    "/recipes",
    "/catalog",
    "/bjcp",
    "/calculators",
    "/guides",
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
