import type { MetadataRoute } from "next";
import { listArticles } from "@nb/content";

import { getServerEnv } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { APP_URL } = getServerEnv();
  const articles = await listArticles();

  return [
    {
      url: APP_URL,
      lastModified: new Date()
    },
    {
      url: `${APP_URL}/bjcp`,
      lastModified: new Date()
    },
    ...articles.map((article) => ({
      url: `${APP_URL}/bjcp/${article.slug}`,
      lastModified: new Date(article.updatedAt)
    }))
  ];
}
