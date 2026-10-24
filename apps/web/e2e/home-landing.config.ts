import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "home-landing.spec.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium", viewport: { width: 1280, height: 900 } } },
    { name: "webkit", use: { browserName: "webkit", viewport: { width: 390, height: 844 } } }
  ]
});
