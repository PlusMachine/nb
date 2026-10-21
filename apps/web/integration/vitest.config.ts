import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import base from "../vitest.config";

// Explicit opt-in: these tests write isolated fixtures to a local PostgreSQL.
export default defineConfig({
  ...base,
  root: fileURLToPath(new URL("../", import.meta.url)),
  test: {
    ...base.test,
    include: ["integration/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 30000
  }
});
