import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { and, db, eq, firmwareReleases, isNotNull, isNull } from "@nb/db";
import { parseServerEnv } from "@nb/shared";

import type { FirmwareChannel, FirmwareManifest, FirmwareReleaseDto, PublishReleaseInput } from "./contracts";
import { publishReleaseSchema } from "./contracts";
import { compareFirmwareVersions, isValidFirmwareVersion, pickLatestRelease } from "./versions";

// =============================================================================
//  features/firmware/service.ts
//  Реестр релизов прошивки BrewForge (F2, docs/brewforge-firmware-releases.md
//  §3–5): публикация/отзыв релиза, выбор последнего опубликованного, решение
//  «есть ли обновление для fw X» и резолв файла .bin для раздачи.
//
//  Хранилище бинарников — диск: FIRMWARE_STORAGE_DIR (env) либо
//  <repoRoot>/storage/firmware; файл — <version>/brewforge-<version>.bin
//  (storagePath в БД — относительный). Каталог в .gitignore.
// =============================================================================

type ReleaseRow = typeof firmwareReleases.$inferSelect;

const mapReleaseDto = (row: ReleaseRow): FirmwareReleaseDto => ({
  id: row.id,
  providerId: row.providerId,
  version: row.version,
  channel: row.channel,
  protocolSchema: row.protocolSchema,
  notes: row.notes,
  fileName: row.fileName,
  fileSize: row.fileSize,
  fileSha256: row.fileSha256,
  publishedAt: row.publishedAt,
  yankedAt: row.yankedAt,
  createdAt: row.createdAt,
});

/**
 * Корень репозитория: ближайший каталог вверх от cwd с pnpm-workspace.yaml.
 * Процессы web/скриптов запускаются из apps/web (pnpm -F), поэтому «просто cwd»
 * не годится — стор должен быть общим для CLI-публикации и раздающих роутов.
 */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/** Абсолютный корень хранилища прошивок. */
export function firmwareStorageDir(): string {
  const fromEnv = process.env.FIRMWARE_STORAGE_DIR;
  if (fromEnv && fromEnv.length > 0) return path.resolve(fromEnv);
  return path.join(findRepoRoot(), "storage", "firmware");
}

/** Относительный путь файла релиза внутри стора: <version>/brewforge-<version>.bin. */
export function releaseStoragePath(version: string): string {
  return path.join(version, `brewforge-${version}.bin`);
}

/**
 * Абсолютный путь к .bin релиза. Гард от traversal: результат обязан оставаться
 * внутри стора (version приходит и из URL роута скачивания).
 */
export function resolveReleaseFilePath(storagePath: string): string {
  const root = firmwareStorageDir();
  const abs = path.resolve(root, storagePath);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error("FIRMWARE_PATH_OUTSIDE_STORAGE");
  }
  return abs;
}

/** Абсолютный URL скачивания релиза (тот же строит мост из APP_URL, см. §5.2/5.3).
 *  Импорт напрямую из @nb/shared (не @/lib/env): сервис зовётся и из CLI-скрипта
 *  (tsx, без next-алиасов). */
export function firmwareDownloadUrl(version: string): string {
  const base = parseServerEnv(process.env).APP_URL.replace(/\/+$/, "");
  return `${base}/api/firmware/download/${encodeURIComponent(version)}`;
}

/**
 * Опубликовать релиз: валидация semver, sha256/size, копия файла в стор,
 * запись с publishedAt=now. Повторная публикация той же (providerId, version) —
 * ошибка RELEASE_ALREADY_EXISTS (защита от подмены бинарника под тем же номером).
 */
export async function publishRelease(input: PublishReleaseInput): Promise<FirmwareReleaseDto> {
  const parsed = publishReleaseSchema.parse(input);
  if (!isValidFirmwareVersion(parsed.version)) {
    throw new Error(`INVALID_VERSION: "${parsed.version}" не semver (ожидается вида 2.1.0 / 2.1.0-dev)`);
  }

  const [existing] = await db
    .select({ id: firmwareReleases.id })
    .from(firmwareReleases)
    .where(and(eq(firmwareReleases.providerId, parsed.providerId), eq(firmwareReleases.version, parsed.version)))
    .limit(1);
  if (existing) {
    throw new Error(`RELEASE_ALREADY_EXISTS: ${parsed.providerId} ${parsed.version} уже публиковался (отзыв — --yank)`);
  }

  const sourcePath = path.resolve(parsed.filePath);
  const fileStat = await stat(sourcePath).catch(() => null);
  if (!fileStat?.isFile() || fileStat.size <= 0) {
    throw new Error(`FILE_NOT_FOUND: нет файла прошивки по пути ${sourcePath}`);
  }

  const content = await readFile(sourcePath);
  const sha256 = createHash("sha256").update(content).digest("hex");

  const storagePath = releaseStoragePath(parsed.version);
  const targetPath = resolveReleaseFilePath(storagePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);

  const [row] = await db
    .insert(firmwareReleases)
    .values({
      providerId: parsed.providerId,
      version: parsed.version,
      channel: parsed.channel,
      protocolSchema: parsed.protocolSchema,
      notes: parsed.notes,
      fileName: path.basename(targetPath),
      fileSize: content.byteLength,
      fileSha256: sha256,
      storagePath,
      publishedAt: new Date(),
    })
    .returning();
  if (!row) throw new Error("PUBLISH_FAILED");
  return mapReleaseDto(row);
}

/** Отозвать релиз (yankedAt=now): раздача прекращается, запись/файл остаются. */
export async function yankRelease(version: string, providerId = "brewforge"): Promise<FirmwareReleaseDto> {
  const [row] = await db
    .update(firmwareReleases)
    .set({ yankedAt: new Date() })
    .where(and(eq(firmwareReleases.providerId, providerId), eq(firmwareReleases.version, version)))
    .returning();
  if (!row) throw new Error(`RELEASE_NOT_FOUND: ${providerId} ${version}`);
  return mapReleaseDto(row);
}

/**
 * Последний опубликованный, не отозванный релиз канала (максимальная semver-
 * версия, не последняя по дате — hotfix старой ветки не должен перекрыть новую).
 */
export async function getLatestPublished(
  channel: FirmwareChannel = "stable",
  providerId = "brewforge",
): Promise<FirmwareReleaseDto | null> {
  const rows = await db
    .select()
    .from(firmwareReleases)
    .where(
      and(
        eq(firmwareReleases.providerId, providerId),
        eq(firmwareReleases.channel, channel),
        isNotNull(firmwareReleases.publishedAt),
        isNull(firmwareReleases.yankedAt),
      ),
    );
  const latest = pickLatestRelease(rows);
  return latest ? mapReleaseDto(latest) : null;
}

/**
 * Есть ли обновление для устройства с прошивкой currentFw: релиз, если последний
 * stable строго новее (prerelease-сборка 2.1.0-dev получит релиз 2.1.0), иначе
 * null. Не-semver currentFw (кастомная сборка) — null: не предлагаем неизвестно что.
 */
export async function findUpdateFor(
  currentFw: string | null,
  opts: { channel?: FirmwareChannel; providerId?: string } = {},
): Promise<FirmwareReleaseDto | null> {
  if (!currentFw || !isValidFirmwareVersion(currentFw)) return null;
  const latest = await getLatestPublished(opts.channel ?? "stable", opts.providerId ?? "brewforge");
  if (!latest) return null;
  return isNewerFirmwareVersionSafe(latest.version, currentFw) ? latest : null;
}

// Обёртка компаратора: обе версии уже провалидированы выше, но держим сравнение
// не бросающим на всякий случай (битые исторические данные не должны валить роут).
function isNewerFirmwareVersionSafe(candidate: string, current: string): boolean {
  try {
    return compareFirmwareVersions(candidate, current) > 0;
  } catch {
    return false;
  }
}

/** Манифест pull-проверки обновлений (спека §5.2) для устройства с fw=current. */
export async function buildManifestFor(currentFw: string): Promise<FirmwareManifest> {
  const release = await findUpdateFor(currentFw);
  if (!release) return { schema: 1, updateAvailable: false };
  return {
    schema: 1,
    updateAvailable: true,
    latest: {
      version: release.version,
      url: firmwareDownloadUrl(release.version),
      sha256: release.fileSha256,
      size: release.fileSize,
      protocolSchema: release.protocolSchema,
      notes: release.notes,
    },
  };
}

/** Опубликованный, не отозванный релиз по точной версии (для роута скачивания). */
export async function getPublishedRelease(
  version: string,
  providerId = "brewforge",
): Promise<FirmwareReleaseDto | null> {
  const row = await getPublishedReleaseRow(version, providerId);
  return row ? mapReleaseDto(row) : null;
}

/**
 * Релиз + абсолютный путь его .bin для раздачи (роут скачивания §5.1). Путь ФС
 * не входит в DTO намеренно — наружу он не отдаётся, резолвится только здесь.
 */
export async function getPublishedReleaseFile(
  version: string,
  providerId = "brewforge",
): Promise<{ release: FirmwareReleaseDto; filePath: string } | null> {
  const row = await getPublishedReleaseRow(version, providerId);
  if (!row) return null;
  return { release: mapReleaseDto(row), filePath: resolveReleaseFilePath(row.storagePath) };
}

async function getPublishedReleaseRow(version: string, providerId: string): Promise<ReleaseRow | null> {
  const [row] = await db
    .select()
    .from(firmwareReleases)
    .where(
      and(
        eq(firmwareReleases.providerId, providerId),
        eq(firmwareReleases.version, version),
        isNotNull(firmwareReleases.publishedAt),
        isNull(firmwareReleases.yankedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
