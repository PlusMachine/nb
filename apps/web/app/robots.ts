import type { MetadataRoute } from "next";

import { getServerEnv } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const { APP_URL } = getServerEnv();

  return {
    rules: {
      userAgent: "*",
      // Фото рецептов — точечное исключение из disallow "/api/": нужны
      // краулеру картинок (Google Images и т.п.).
      allow: ["/", "/api/recipe-images/"],
      // Приватные зоны (требуют логина/роли), служебные и технические пути
      // индексировать не нужно.
      disallow: [
        "/api/",
        "/app",
        "/admin",
        "/login",
        "/profile",
        "/settings",
        "/recipes/id/",
        "/catalog/new",
        "/catalog/custom/",
        "/ui-playground",
        "/offline"
      ]
    },
    sitemap: `${APP_URL}/sitemap.xml`
  };
}
