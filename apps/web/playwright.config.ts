import { defineConfig, devices } from "@playwright/test";

// Named after real breakpoints in calculator-page-client.tsx (sidebar layout kicks in at lg=1024px).
const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  laptop: { width: 1280, height: 900 },
  desktop: { width: 1920, height: 1080 }
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    // Порт 3000 бывает занят другим dev-сервером (несколько сессий на одном
    // чекауте) — тогда прогон нацеливают на живой стенд через E2E_BASE_URL.
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    // Закреплено намеренно: нативный input[type=date] рендерит формат по локали браузера,
    // без этого прогон на CI-локали давал ложный сигнал по формату «Дата варки».
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    trace: "on-first-retry"
  },
  projects: [
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: VIEWPORTS.mobile } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: VIEWPORTS.tablet } },
    { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: VIEWPORTS.laptop } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: VIEWPORTS.desktop } }
  ],
  // Ожидает уже поднятый dev-сервер (БД смигрирована/засеяна) — при его отсутствии
  // поднимет собственный next dev, но тогда миграции/сид нужно прогнать заранее (`npm run db:migrate db:seed` из корня).
  webServer: {
    command: "pnpm run dev",
    url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000
  }
});
