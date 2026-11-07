import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "performance-regression.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3018",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }]
});
