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
  // TTF наклеек читаются по динамическому пути (fontDirs) — file tracing сам
  // их не находит, без этого standalone-сборка останется без шрифтов.
  outputFileTracingIncludes: {
    "/api/labels/[recipeId]": ["./features/labels/fonts/**/*"]
  },
  async redirects() {
    // Каталог переехал из рабочей зоны в публичную: /app/catalog -> /catalog.
    return [
      { source: "/app/catalog", destination: "/catalog", permanent: true },
      { source: "/app/catalog/:path*", destination: "/catalog/:path*", permanent: true }
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
