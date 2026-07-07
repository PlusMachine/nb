import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import manifest from "../app/manifest";

const webRoot = fileURLToPath(new URL("..", import.meta.url));

// "/images/pwa/x.png" → apps/web/public/images/pwa/x.png, "/icon.svg" → apps/web/app/icon.svg
const iconSrcToDiskPath = (src: string) => {
  if (src === "/icon.svg") {
    return resolve(webRoot, "app/icon.svg");
  }
  return resolve(webRoot, "public", src.replace(/^\//u, ""));
};

describe("PWA manifest", () => {
  const manifestJson = manifest();

  it("стартует с дашборда /app, а не с киоска приборов", () => {
    expect(manifestJson.start_url).toBe("/app");
  });

  it("каждая иконка существует на диске", () => {
    expect(manifestJson.icons?.length).toBeGreaterThan(0);
    for (const icon of manifestJson.icons ?? []) {
      expect(existsSync(iconSrcToDiskPath(icon.src))).toBe(true);
    }
  });

  it("есть maskable-иконка 512×512", () => {
    const maskable = manifestJson.icons?.find((icon) => icon.purpose === "maskable");
    expect(maskable).toBeDefined();
    expect(maskable?.sizes).toBe("512x512");
  });

  it("ярлыки (shortcuts) заданы и ведут на реальные разделы", () => {
    expect(manifestJson.shortcuts?.length).toBeGreaterThan(0);
    for (const shortcut of manifestJson.shortcuts ?? []) {
      expect(shortcut.name.length).toBeGreaterThan(0);
      expect(shortcut.url.startsWith("/")).toBe(true);
    }
  });

  it("у скруглённой icon-512.png угол прозрачен, у maskable-512.png — непрозрачен", async () => {
    const cornerAlpha = async (path: string) => {
      const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return data[info.channels - 1];
    };

    const roundedAlpha = await cornerAlpha(resolve(webRoot, "public/images/pwa/icon-512.png"));
    const maskableAlpha = await cornerAlpha(resolve(webRoot, "public/images/pwa/icon-maskable-512.png"));

    expect(roundedAlpha).toBe(0);
    expect(maskableAlpha).toBe(255);
  });
});
