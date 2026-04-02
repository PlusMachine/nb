import { copyFile, mkdir, readdir, rename, rm, stat, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(moduleDir, "../../..");
const bjcpDir = resolve(repoRoot, "ingredients/bjcp");
const sourceImagesDir = resolve(bjcpDir, "images");
const publicImagesDir = resolve(repoRoot, "apps/web/public/images/bjcp");

const isImageFile = (fileName) => /\.(png|jpe?g|webp|avif)$/iu.test(fileName);

const sortFileNames = (values) => values.sort((left, right) => left.localeCompare(right, "en", {
  numeric: true,
  sensitivity: "base"
}));

const extractStyleIdFromImageFileName = (fileName) => {
  const normalized = fileName.normalize("NFC");
  const basename = normalized.replace(/\.[^.]+$/u, "");
  const match = basename.match(/^(.+?)\s+—\s+/u);

  return (match?.[1] ?? basename).trim();
};

const loadStylesById = async () => {
  const fileNames = sortFileNames(
    (await readdir(bjcpDir)).filter((fileName) => /^bjcp_styles_.*\.json$/iu.test(fileName))
  );
  const stylesById = new Map();

  for (const fileName of fileNames) {
    const raw = await readFile(resolve(bjcpDir, fileName), "utf8");
    const data = JSON.parse(raw);

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

const ensureDir = async (dirPath) => {
  try {
    const info = await stat(dirPath);
    if (!info.isDirectory()) {
      throw new Error(`${dirPath} exists and is not a directory`);
    }
  } catch {
    await mkdir(dirPath, { recursive: true });
  }
};

const filesAreEqual = async (leftPath, rightPath) => {
  try {
    const [leftStat, rightStat] = await Promise.all([stat(leftPath), stat(rightPath)]);
    if (leftStat.size !== rightStat.size) {
      return false;
    }

    const [leftBuffer, rightBuffer] = await Promise.all([readFile(leftPath), readFile(rightPath)]);
    return leftBuffer.equals(rightBuffer);
  } catch {
    return false;
  }
};

const getCanonicalFileName = (fileName, stylesById) => {
  const styleId = extractStyleIdFromImageFileName(fileName);
  const styleName = stylesById.get(styleId);
  if (!styleName) {
    return null;
  }

  return `${styleId} — ${styleName}${extname(fileName)}`;
};

const renameSourceFilesToCanonicalNames = async (stylesById) => {
  const imageFiles = sortFileNames((await readdir(sourceImagesDir)).filter(isImageFile));
  const renamed = [];

  for (const fileName of imageFiles) {
    const canonicalFileName = getCanonicalFileName(fileName, stylesById);
    if (!canonicalFileName || canonicalFileName === fileName) {
      continue;
    }

    await rename(resolve(sourceImagesDir, fileName), resolve(sourceImagesDir, canonicalFileName));
    renamed.push({ from: fileName, to: canonicalFileName });
  }

  return renamed;
};

const syncPublicDirectory = async () => {
  await ensureDir(publicImagesDir);

  const sourceFiles = sortFileNames((await readdir(sourceImagesDir)).filter(isImageFile));
  const publicFiles = new Set((await readdir(publicImagesDir)).filter(isImageFile));
  const sourceFileSet = new Set(sourceFiles);
  const copied = [];
  const updated = [];
  const removed = [];

  for (const fileName of sourceFiles) {
    const sourcePath = resolve(sourceImagesDir, fileName);
    const publicPath = resolve(publicImagesDir, fileName);

    if (!publicFiles.has(fileName)) {
      await copyFile(sourcePath, publicPath);
      copied.push(fileName);
      continue;
    }

    if (await filesAreEqual(sourcePath, publicPath)) {
      continue;
    }

    await copyFile(sourcePath, publicPath);
    updated.push(fileName);
  }

  for (const fileName of publicFiles) {
    if (sourceFileSet.has(fileName)) {
      continue;
    }

    await rm(resolve(publicImagesDir, fileName));
    removed.push(fileName);
  }

  return { copied, updated, removed, sourceFiles };
};

const collectMissingStyleImages = (stylesById, sourceFiles) => {
  const sourceIds = new Set(sourceFiles.map(extractStyleIdFromImageFileName));

  return Array.from(stylesById.entries())
    .filter(([styleId]) => !sourceIds.has(styleId))
    .map(([styleId, styleName]) => ({ styleId, styleName }));
};

const main = async () => {
  const stylesById = await loadStylesById();
  const renamed = await renameSourceFilesToCanonicalNames(stylesById);
  const { copied, updated, removed, sourceFiles } = await syncPublicDirectory();
  const missingStyles = collectMissingStyleImages(stylesById, sourceFiles);

  console.log(`Source images: ${sourceFiles.length}`);
  console.log(`Renamed source files: ${renamed.length}`);
  for (const entry of renamed) {
    console.log(`RENAME\t${entry.from}\t=>\t${entry.to}`);
  }

  console.log(`Copied to public: ${copied.length}`);
  for (const fileName of copied) {
    console.log(`COPY\t${fileName}`);
  }

  console.log(`Updated existing public files: ${updated.length}`);
  for (const fileName of updated) {
    console.log(`UPDATE\t${fileName}`);
  }

  console.log(`Removed stale public files: ${removed.length}`);
  for (const fileName of removed) {
    console.log(`REMOVE\t${fileName}`);
  }

  console.log(`Missing source images: ${missingStyles.length}`);
  for (const entry of missingStyles) {
    console.log(`MISSING\t${entry.styleId}\t${entry.styleName}`);
  }
};

await main();
