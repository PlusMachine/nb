import { readdir } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { DEFAULT_BJCP_HERO_IMAGE_URL } from "@nb/content";

import { loadBjcpOgPhoto, preparePhotoInset } from "../features/og/photo";
import { OG_PHOTO_WIDTH, OG_SIZE } from "../features/og/theme";

// Синтетическое исходное фото — градиент 1200×900 (портретный аспект, крупнее
// врезки), чтобы прогнать реальный sharp-пайплайн resize+recode, а не мокать его.
const buildSyntheticPng = async (): Promise<Buffer> =>
  sharp({
    create: {
      width: 1200,
      height: 900,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
      // Шум, а не сплошная заливка — иначе JPEG сожмётся до пары КБ и тест
      // веса ничего не проверяет.
      noise: { type: "gaussian", mean: 128, sigma: 60 }
    }
  })
    .png()
    .toBuffer();

const buildSyntheticWebp = async (): Promise<Buffer> =>
  sharp({
    create: {
      width: 800,
      height: 800,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
      noise: { type: "gaussian", mean: 128, sigma: 60 }
    }
  })
    .webp()
    .toBuffer();

describe("preparePhotoInset", () => {
  it("отдаёт JPEG data URI ровно OG_PHOTO_WIDTH×630, вес врезки < 150 КБ", async () => {
    const input = await buildSyntheticPng();
    const photo = await preparePhotoInset(input);

    expect(photo.dataUri.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(photo.width).toBe(OG_PHOTO_WIDTH);
    expect(photo.height).toBe(OG_SIZE.height);

    const base64 = photo.dataUri.slice("data:image/jpeg;base64,".length);
    const buffer = Buffer.from(base64, "base64");
    expect(buffer.byteLength).toBeLessThan(150 * 1024);

    const metadata = await sharp(buffer).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(OG_PHOTO_WIDTH);
    expect(metadata.height).toBe(OG_SIZE.height);
  });

  it("вход webp тоже перекодируется в JPEG (Satori не ест webp)", async () => {
    const input = await buildSyntheticWebp();
    const photo = await preparePhotoInset(input);

    expect(photo.dataUri.startsWith("data:image/jpeg;base64,")).toBe(true);
    const buffer = Buffer.from(photo.dataUri.slice("data:image/jpeg;base64,".length), "base64");
    const metadata = await sharp(buffer).metadata();
    expect(metadata.format).toBe("jpeg");
  });
});

describe("loadBjcpOgPhoto", () => {
  it("плейсхолдер BJCP-каталога → null (нечего встраивать)", async () => {
    await expect(loadBjcpOgPhoto(DEFAULT_BJCP_HERO_IMAGE_URL)).resolves.toBeNull();
  });

  it("path traversal в имени файла → null", async () => {
    await expect(loadBjcpOgPhoto("/images/bjcp/..%2F..%2Fsecret.png")).resolves.toBeNull();
  });

  it("несуществующий файл → null", async () => {
    await expect(loadBjcpOgPhoto("/images/bjcp/nonexistent-style-xyz.png")).resolves.toBeNull();
  });

  it("URL вне каталога /images/bjcp/ → null", async () => {
    await expect(loadBjcpOgPhoto("/images/other/foo.png")).resolves.toBeNull();
  });

  it("реальная иллюстрация из public/images/bjcp → готовая врезка", async () => {
    const dir = path.join(process.cwd(), "public/images/bjcp");
    const fileNames = await readdir(dir);
    const firstPng = fileNames.find((name) => name.toLowerCase().endsWith(".png"));
    expect(firstPng).toBeTruthy();

    const heroImageUrl = `/images/bjcp/${encodeURIComponent(firstPng!)}`;
    const photo = await loadBjcpOgPhoto(heroImageUrl);

    expect(photo).not.toBeNull();
    expect(photo!.dataUri.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(photo!.width).toBe(OG_PHOTO_WIDTH);
    expect(photo!.height).toBe(OG_SIZE.height);
  });
});
