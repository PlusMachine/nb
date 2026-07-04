import type { MetadataRoute } from "next";
import { listArticles } from "@nb/content";

import { getServerEnv } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { APP_URL } = getServerEnv();
  const articles = await listArticles();
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
    }))
  ];
}
