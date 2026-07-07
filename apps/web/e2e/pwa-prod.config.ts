import { defineConfig, devices } from "@playwright/test";

// Отдельный конфиг для PWA e2e-прогона против уже собранного/поднятого prod-билда
// (`next build && next start`, порт 3011 по умолчанию) — service worker в next dev
// не регистрируется (см. features/pwa/use-service-worker.ts), поэтому основной
// playwright.config.ts с его dev webServer тут не подходит. Сервер поднимает
// вызывающая сторона (CI/скрипт), этот конфиг сервер сам не стартует.
export default defineConfig({
  testDir: ".",
  testMatch: "pwa.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.PWA_BASE_URL ?? "http://localhost:3011",
    trace: "on-first-retry"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
