import sharp from "sharp";

const MAX_INPUT_PIXELS = 40_000_000;
const allowedInputFormats = new Set(["jpeg", "png", "webp"]);

const mapSharpInputError = (error: unknown): never => {
  if (error instanceof Error) {
    throw new Error("INVALID_IMAGE_FILE");
  }

  throw error;
};

const normalizeOriginalFormat = (mimeType: string) => {
  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "jpeg";
};

const buildOriginalDerivative = async (
  buffer: Buffer,
  mimeType: string
) => {
  const format = normalizeOriginalFormat(mimeType);
  const pipeline = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();

  switch (format) {
    case "png":
      return pipeline.png({
        compressionLevel: 9,
        progressive: true
      }).toBuffer({ resolveWithObject: true });
    case "webp":
      return pipeline.webp({
        quality: 92
      }).toBuffer({ resolveWithObject: true });
    default:
      return pipeline.jpeg({
        quality: 92,
        mozjpeg: true
      }).toBuffer({ resolveWithObject: true });
  }
};

const buildWebpDerivative = (
  buffer: Buffer,
  longSide: number
) => sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
  .resize({
    width: longSide,
    height: longSide,
    fit: "inside",
    withoutEnlargement: true
  })
  .webp({
    quality: longSide <= 480 ? 80 : 86
  })
  .toBuffer();

const buildBlurDataUrl = async (buffer: Buffer) => {
  const blurBuffer = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize({
      width: 24,
      height: 24,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: 40 })
    .toBuffer();

  return `data:image/webp;base64,${blurBuffer.toString("base64")}`;
};

export type ProcessedRecipeImageResult = {
  width: number;
  height: number;
  originalBuffer: Buffer;
  originalContentType: string;
  originalExtension: string;
  largeBuffer: Buffer;
  mediumBuffer: Buffer;
  thumbBuffer: Buffer;
  blurDataUrl: string;
};

export const processRecipeImageUpload = async (
  buffer: Buffer,
  mimeType: string
): Promise<ProcessedRecipeImageResult> => {
  const metadata = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .metadata()
    .catch(mapSharpInputError);

  if (!metadata.format || !allowedInputFormats.has(metadata.format)) {
    throw new Error("INVALID_IMAGE_FILE");
  }

  const original = await buildOriginalDerivative(buffer, mimeType)
    .catch(mapSharpInputError);
  const width = original.info.width ?? null;
  const height = original.info.height ?? null;

  if (!width || !height) {
    throw new Error("IMAGE_DIMENSIONS_MISSING");
  }

  const originalExtension = normalizeOriginalFormat(mimeType) === "jpeg"
    ? "jpg"
    : normalizeOriginalFormat(mimeType);
  const originalContentType = normalizeOriginalFormat(mimeType) === "jpeg"
    ? "image/jpeg"
    : mimeType;

  const [largeBuffer, mediumBuffer, thumbBuffer, blurDataUrl] = await Promise.all([
    buildWebpDerivative(original.data, 2560),
    buildWebpDerivative(original.data, 1200),
    buildWebpDerivative(original.data, 480),
    buildBlurDataUrl(original.data)
  ]).catch(mapSharpInputError);

  return {
    width,
    height,
    originalBuffer: original.data,
    originalContentType,
    originalExtension,
    largeBuffer,
    mediumBuffer,
    thumbBuffer,
    blurDataUrl
  };
};
