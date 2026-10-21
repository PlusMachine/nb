import { defineConfig } from "@playwright/test";

// Реальные React-хуки в Chromium, без Next-сервера и подключения к БД.
export default defineConfig({
  testDir: ".",
  testMatch: ["recipe-autosave.spec.ts", "brew-day-progress.spec.ts"],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  use: { browserName: "chromium" }
});
