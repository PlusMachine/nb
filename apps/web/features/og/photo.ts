import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { DEFAULT_BJCP_HERO_IMAGE_URL } from "@nb/content";

import { getRecipeImageAsset } from "@/features/recipe-images/service";

import type { OgPhoto } from "./models";
import { OG_PHOTO_WIDTH, OG_SIZE } from "./theme";

// Фото-врезка OG-карточек (Ф5, docs/specs/og-images.md §5.1/§5.4). Server-only:
// читает байты фото/иллюстраций (storage-адаптер / fs) и sharp-ом готовит их к
// вставке в Satori. Импортировать ТОЛЬКО из route-хендлеров api/og/* — никогда
// из клиентских компонентов.
//
// Почему JPEG всегда: Satori (@vercel/og) не умеет декодировать webp/avif в
// <img src> (кидает «Unsupported image type»), а все деривативы фото рецептов
// (large/medium/thumb) — webp (features/recipe-images/image-processing.ts).
// Почему data URI: относительный/сетевой src на сервере Satori не резолвит
// («Image source must be an absolute URL»), а сеть внутри рендера — лишняя
// точка отказа. Почему явные width/height на выходе: без них Satori не может
// определить размер картинки и падает («Image size cannot be determined»).

const MAX_INPUT_PIXELS = 40_000_000;

/** Пережимает произвольное входное фото в JPEG-врезку OG_PHOTO_WIDTH×OG_SIZE.height. */
export const preparePhotoInset = async (input: Buffer): Promise<OgPhoto> => {
  const buffer = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize({ width: OG_PHOTO_WIDTH, height: OG_SIZE.height, fit: "cover" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();

  return {
    dataUri: `data:image/jpeg;base64,${buffer.toString("base64")}`,
    width: OG_PHOTO_WIDTH,
    height: OG_SIZE.height
  };
};

/**
 * Фото-врезка для рецепта с обложкой. Фото — необязательное усиление карточки,
 * не повод для 500/фолбэка: НЕ найдено, не «ready», сбой storage-адаптера или
 * sharp не смог декодировать — в любом случае карточка просто выходит без
 * врезки. Мемоизацию намеренно не делаем: фото рецептов многочисленны и
 * меняются, а HTTP-кэш route-ответа (OG_CACHE_CONTROL) уже даёт нужный эффект.
 */
export const loadRecipeOgPhoto = async (heroImageId: string): Promise<OgPhoto | null> => {
  try {
    const asset = await getRecipeImageAsset({
      imageId: heroImageId,
      variant: "medium",
      viewerId: null,
      beerShareKey: null
    });
    return await preparePhotoInset(asset.body);
  } catch {
    return null;
  }
};

/**
 * Каталог PNG-иллюстраций стилей BJCP. process.cwd() в next dev/build и
 * vitest — apps/web; на случай запуска из корня монорепо пробуем и путь с
 * префиксом apps/web (тот же паттерн, что labelFontsDir в features/labels/fonts.ts).
 */
const bjcpImagesDir = (): string => {
  const direct = path.join(process.cwd(), "public/images/bjcp");
  if (fs.existsSync(direct)) {
    return direct;
  }
  return path.join(process.cwd(), "apps/web/public/images/bjcp");
};

const BJCP_IMAGES_URL_PREFIX = "/images/bjcp/";

// Иллюстрации статичны (128 файлов, меняются только с деплоем контента) —
// мемоизируем по heroImageUrl, чтобы не гонять fs.readFile+sharp на каждый
// запрос карточки одного и того же стиля. Кап на размер: 128 стилей влезают
// целиком, при переполнении (не должно случаться) просто перестаём добавлять
// новые ключи — не тащить LRU-библиотеку ради этого.
const bjcpPhotoCache = new Map<string, Promise<OgPhoto | null>>();
const BJCP_PHOTO_CACHE_LIMIT = 128;

/**
 * Фото-врезка для стиля BJCP с реальной иллюстрацией (плейсхолдер — null, его
 * рисовать врезкой незачем). Путь проверяется на traversal (декодированное имя
 * файла не должно содержать разделителей пути, а резолвнутый путь — обязан
 * остаться внутри каталога иллюстраций); любая ошибка (malformed URI,
 * traversal, файл не найден, sharp не смог декодировать) → null, БЕЗ
 * кэширования — временный fs-сбой не должен залипать в памяти процесса.
 */
export const loadBjcpOgPhoto = (heroImageUrl: string): Promise<OgPhoto | null> => {
  const cached = bjcpPhotoCache.get(heroImageUrl);
  if (cached) {
    return cached;
  }

  const promise = (async (): Promise<OgPhoto | null> => {
    if (!heroImageUrl.startsWith(BJCP_IMAGES_URL_PREFIX) || heroImageUrl === DEFAULT_BJCP_HERO_IMAGE_URL) {
      return null;
    }

    let fileName: string;
    try {
      fileName = decodeURIComponent(heroImageUrl.slice(BJCP_IMAGES_URL_PREFIX.length));
    } catch {
      return null;
    }
    if (fileName.includes("/") || fileName.includes("\\")) {
      return null;
    }

    const dir = bjcpImagesDir();
    const filePath = path.resolve(dir, fileName);
    if (!filePath.startsWith(dir + path.sep)) {
      return null;
    }

    try {
      const buffer = await fs.promises.readFile(filePath);
      return await preparePhotoInset(buffer);
    } catch {
      return null;
    }
  })();

  promise.then((result) => {
    if (result === null) {
      bjcpPhotoCache.delete(heroImageUrl);
    }
  });

  if (bjcpPhotoCache.size >= BJCP_PHOTO_CACHE_LIMIT) {
    const oldestKey = bjcpPhotoCache.keys().next().value;
    if (oldestKey !== undefined) {
      bjcpPhotoCache.delete(oldestKey);
    }
  }
  bjcpPhotoCache.set(heroImageUrl, promise);

  return promise;
};
