import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nb/ui", "@nb/shared", "@nb/db"],
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
