import { defineConfig, devices } from "@playwright/test";
import base from "../playwright.config";

// Настоящий touch viewport: Desktop Chrome с одной лишь шириной не покрывает
// мобильное масштабирование и выходы layout viewport за экран.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: ["mobile-audit.spec.ts", "bjcp-search.spec.ts", "calculators-unit-converter.spec.ts", "beer-presentation.spec.ts"],
  retries: 0,
  workers: 1,
  timeout: 60_000,
  outputDir: "../../../notes/mobile-audit-2026-10-21/retest/playwright",
  use: { ...base.use, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    ["phone-320", 320, 740],
    ["phone-360", 360, 800],
    ["phone-390", 390, 844],
    ["tablet-768", 768, 1024],
    ["tablet-834", 834, 1112],
    ["tablet-landscape", 1024, 768]
  ].map(([name, width, height]) => ({
    name: String(name),
    use: { ...devices["Desktop Chrome"], viewport: { width: Number(width), height: Number(height) }, isMobile: true, hasTouch: true }
  }))
});
