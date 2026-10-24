import { defineConfig } from "@playwright/test";

const webkitLaunch = process.env.NB_WEBKIT_EXECUTABLE
  ? { executablePath: process.env.NB_WEBKIT_EXECUTABLE }
  : undefined;

export default defineConfig({
  testDir: ".",
  testMatch: ["mobile-audit.spec.ts", "theme-menu.spec.ts", "brewforge-demo.spec.ts"],
  outputDir: "../../../notes/copy-layout-audit-2026-10-23/e2e-results",
  fullyParallel: true,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "../../../notes/copy-layout-audit-2026-10-23/e2e.json" }]
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3010",
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "mobile", use: { browserName: "chromium", viewport: { width: 320, height: 844 } } },
    { name: "tablet640", use: { browserName: "chromium", viewport: { width: 640, height: 1000 } } },
    { name: "tablet", use: { browserName: "chromium", viewport: { width: 834, height: 1112 } } },
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "safari-mobile", use: { browserName: "webkit", launchOptions: webkitLaunch, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "safari-tablet", use: { browserName: "webkit", launchOptions: webkitLaunch, viewport: { width: 834, height: 1112 }, isMobile: true, hasTouch: true } },
    { name: "safari-desktop", use: { browserName: "webkit", launchOptions: webkitLaunch, viewport: { width: 1280, height: 900 } } }
  ]
});
