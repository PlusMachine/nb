import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nb/ui", "@nb/shared", "@nb/db"]
};

export default nextConfig;
