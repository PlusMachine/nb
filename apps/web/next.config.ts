import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  // Несколько dev-серверов на одном чекауте (параллельные сессии) пишут в один
  // `.next` и затирают друг другу манифесты — роут «исчезает» с 404 на ровном
  // месте. Второму и последующим серверам дают свой каталог: NEXT_DIST_DIR=.next-2.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  outputFileTracingRoot: repoRoot,
  transpilePackages: ["@nb/ui", "@nb/shared", "@nb/db", "@nb/content", "@nb/brewforge-protocol", "@nb/brewforge-sim", "@nb/push"],
  // web-push — node-библиотека (crypto/https), только серверная: не бандлим, грузим
  // через require в рантайме (импортируется @nb/push из серверного роута/моста).
  // @resvg/resvg-js — нативный .node-бинарь (рендер наклеек), webpack его не парсит.
  serverExternalPackages: ["web-push", "@resvg/resvg-js"],
  // TTF читаются по динамическому пути (fontDirs/labelFontsDir) — file tracing сам
  // их не находит, без этого standalone-сборка останется без шрифтов. Нужно и
  // наклейкам, и OG-карточкам (features/og/fonts.ts берёт те же Rubik TTF).
  outputFileTracingIncludes: {
    "/api/labels/[recipeId]": ["./features/labels/fonts/**/*"],
    "/api/og/recipes/[slug]": ["./features/labels/fonts/**/*"],
    // Ф2: остальные рантайм-роуты OG-карточек (Satori читает те же Rubik TTF).
    "/api/og/catalog/[source]/[id]": ["./features/labels/fonts/**/*"],
    // Ф5: loadBjcpOgPhoto читает public/images/bjcp/*.png по динамическому
    // имени — тот же класс ловушки, что с TTF шрифтов: fs-чтение по пути,
    // собранному из данных в рантайме, не трассируется само.
    "/api/og/bjcp/[slug]": ["./features/labels/fonts/**/*", "./public/images/bjcp/**/*"],
    "/api/og/articles/[slug]": ["./features/labels/fonts/**/*"],
    "/api/og/masters/[slug]": ["./features/labels/fonts/**/*"],
    "/api/og/beer/[slug]": ["./features/labels/fonts/**/*"],
    // Ф3: обложки разделов (хабы + категорийные лендинги каталога).
    "/api/og/sections/[key]": ["./features/labels/fonts/**/*"],
    // Ф4: карточки калькуляторов (v1 без query + v2 с результатом).
    "/api/og/calculators/[slug]": ["./features/labels/fonts/**/*"]
  },
  async redirects() {
    // Каталог переехал из рабочей зоны в публичную: /app/catalog -> /catalog.
    return [
      { source: "/app/catalog", destination: "/catalog", permanent: true },
      { source: "/app/catalog/:path*", destination: "/catalog/:path*", permanent: true },
      { source: "/styles", destination: "/bjcp", permanent: true },
      { source: "/styles/:path*", destination: "/bjcp/:path*", permanent: true }
    ];
  },
  webpack: (config) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /@opentelemetry\/instrumentation/,
        message: /Critical dependency: the request of a dependency is an expression/
      }
    ];

    // ESM-пакеты монорепо (напр. @nb/brewforge-protocol, type:module) импортируют
    // соседей с расширением «.js» по NodeNext-конвенции, хотя исходники — «.ts».
    // Учим webpack резолвить .js → .ts/.tsx с фоллбэком на реальный .js (порядок
    // важен: .ts первым; реальные .js-модули всё равно находятся последним пунктом).
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"]
    };

    return config;
  }
};

export default nextConfig;
