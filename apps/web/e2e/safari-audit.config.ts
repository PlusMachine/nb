import { defineConfig, devices } from "@playwright/test";
import mobileAudit from "./mobile-audit.config";

export default defineConfig({
  ...mobileAudit,
  outputDir: "../../../notes/mobile-audit-2026-10-21/safari/playwright",
  reporter: [
    ["list"],
    ["json", { outputFile: "../../../notes/mobile-audit-2026-10-21/safari/results.json" }]
  ],
  testMatch: [
    ...(mobileAudit.testMatch as string[]),
    "safari-interactions.spec.ts"
  ],
  use: {
    ...mobileAudit.use,
    launchOptions: { executablePath: process.env.WEBKIT_EXECUTABLE_PATH }
  },
  projects: [
    ["iphone-se", "iPhone SE"],
    ["iphone-13", "iPhone 13"],
    ["iphone-landscape", "iPhone 13 landscape"],
    ["ipad-mini", "iPad Mini"],
    ["ipad-mini-landscape", "iPad Mini landscape"],
    ["ipad-pro", "iPad Pro 11"],
    ["ipad-pro-landscape", "iPad Pro 11 landscape"]
  ].map(([name, device]) => ({
    name,
    use: { ...devices[device], browserName: "webkit" }
  }))
});
