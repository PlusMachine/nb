import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  transpilePackages: ["@nb/ui", "@nb/shared", "@nb/db", "@nb/content"],
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

    return config;
  }
};

export default nextConfig;
