import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url))
    }
  },
  test: {
    environment: "node",
    // tests/** — основной набор; features/** — колокированные юнит-тесты без БД
    // (brew-controller: translator + transport SSRF-гард).
    include: ["tests/**/*.test.ts", "features/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"]
  }
});
