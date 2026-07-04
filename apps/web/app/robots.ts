import type { MetadataRoute } from "next";

import { getServerEnv } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const { APP_URL } = getServerEnv();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Приватные зоны (требуют логина/роли) и API индексировать не нужно.
      disallow: ["/api/", "/app", "/admin"]
    },
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL
  };
}
