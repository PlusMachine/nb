import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const bjcpDir = resolve(moduleDir, "../../../ingredients/bjcp");
const sourceImagesDir = resolve(bjcpDir, "images");
const publicImagesDir = resolve(moduleDir, "../../../apps/web/public/images/bjcp");

const isImageFile = (fileName: string) => /\.(png|jpe?g|webp|avif)$/iu.test(fileName);

const sortFileNames = (values: string[]) => values.sort((left, right) => left.localeCompare(right, "en", {
  numeric: true,
  sensitivity: "base"
}));

const extractStyleIdFromImageFileName = (fileName: string) => {
  const normalized = fileName.normalize("NFC");
  const basename = normalized.replace(/\.[^.]+$/u, "");
  const match = basename.match(/^(.+?)\s+—\s+/u);

  return (match?.[1] ?? basename).trim();
};

const loadStylesById = async () => {
  const fileNames = sortFileNames(
    (await readdir(bjcpDir)).filter((fileName) => /^bjcp_styles_.*\.json$/iu.test(fileName))
  );
  const stylesById = new Map<string, string>();

  for (const fileName of fileNames) {
    const raw = await readFile(resolve(bjcpDir, fileName), "utf8");
    const data = JSON.parse(raw) as {
      styles?: Array<{ bjcp_id?: string; name_en?: string }>;
    };

    for (const style of data.styles ?? []) {
      const styleId = style.bjcp_id?.trim();
      const styleName = style.name_en?.trim();
      if (!styleId || !styleName) {
        continue;
      }

      stylesById.set(styleId, styleName);
    }
  }

  return stylesById;
};

describe("BJCP image sync", () => {
  it("keeps source image filenames canonical", async () => {
    const stylesById = await loadStylesById();
    const sourceFiles = sortFileNames((await readdir(sourceImagesDir)).filter(isImageFile));

    expect(sourceFiles.length).toBeGreaterThan(0);

    for (const fileName of sourceFiles) {
      const styleId = extractStyleIdFromImageFileName(fileName);
      const styleName = stylesById.get(styleId);

      expect(styleName, `${fileName} references an unknown BJCP style`).toBeTruthy();
      expect(fileName).toBe(`${styleId} — ${styleName}${extname(fileName)}`);
    }
  });

  it("keeps public images fully synced with source images", async () => {
    const [sourceFiles, publicFiles] = await Promise.all([
      readdir(sourceImagesDir),
      readdir(publicImagesDir)
    ]);

    const sourceImageFiles = sortFileNames(sourceFiles.filter(isImageFile));
    const publicImageFiles = sortFileNames(publicFiles.filter(isImageFile));

    expect(sourceImageFiles).toEqual(publicImageFiles);

    for (const fileName of sourceImageFiles) {
      const [sourceBuffer, publicBuffer] = await Promise.all([
        readFile(resolve(sourceImagesDir, fileName)),
        readFile(resolve(publicImagesDir, fileName))
      ]);

      expect(sourceBuffer.equals(publicBuffer), `${fileName} differs between source and public`).toBe(true);
    }
  });
});
