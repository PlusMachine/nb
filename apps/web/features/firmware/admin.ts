import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { and, db, desc, eq, firmwareReleases, inArray, systemEvents, users } from "@nb/db";

import { SYSTEM_ACTOR_NAME } from "@/features/audit/contracts";
import { recordAuditEvent } from "@/features/audit/service";

import {
  FIRMWARE_UPLOAD_ACCEPT,
  FIRMWARE_UPLOAD_MAX_BYTES,
  firmwareChannelSchema,
  firmwareReleaseStatusLabels,
  type AdminFirmwareRelease,
  type FirmwareChannel,
  type FirmwareReleaseDto,
  type FirmwareReleaseStatus
} from "./contracts";
import { publishRelease, yankRelease } from "./service";
import { isValidFirmwareVersion, pickLatestRelease } from "./versions";

// =============================================================================
//  features/firmware/admin.ts
//  Админ-слой реестра прошивок (/admin/firmware): выборка релизов со статусом и
//  автором публикации + композиция «загрузка .bin → publishRelease → аудит».
//
//  Публикация/отзыв целиком лежат в service.ts — здесь только то, чего там нет:
//  staging загруженного файла во временный путь (publishRelease принимает путь на
//  диске, не буфер) и запись в журнал. Валидация формы — чистая, без БД и ФС,
//  чтобы роут загрузки мог отсечь мусор до записи файла.
//
//  Автор публикации не хранится в firmware_releases (колонки нет) — он берётся из
//  журнала (system_events, action="firmware.publish", entityId=версия). Релизы,
//  опубликованные CLI (npm run firmware:publish), автора не имеют — «Система».
// =============================================================================

/** Потолок размера образа: типовой .bin BrewForge ~2 МБ, запас — на рост разделов. */
export type FirmwareUploadInput = {
  fileName: string;
  fileSize: number;
  version: string;
  notes: string;
  channel: FirmwareChannel;
  protocolSchema: number;
};

export type FirmwareUploadValidation = { ok: true } | { ok: false; error: string };

/**
 * Проверка формы загрузки до касания диска и БД. Дубль версии здесь не ловится
 * (нужен запрос) — его отдаёт publishRelease (RELEASE_ALREADY_EXISTS).
 */
export const validateFirmwareUpload = (input: FirmwareUploadInput): FirmwareUploadValidation => {
  const version = input.version.trim();
  if (!version) {
    return { ok: false, error: "Укажите версию." };
  }
  if (!isValidFirmwareVersion(version)) {
    return {
      ok: false,
      error: `Версия «${version}» не semver — ожидается вида 2.1.0 или 2.1.0-dev.`
    };
  }

  if (!input.notes.trim()) {
    return { ok: false, error: "Добавьте заметки к релизу." };
  }

  if (!firmwareChannelSchema.safeParse(input.channel).success) {
    return { ok: false, error: "Неизвестный канал релиза." };
  }

  if (!Number.isInteger(input.protocolSchema) || input.protocolSchema < 1) {
    return { ok: false, error: "Версия схемы протокола — целое число от 1." };
  }

  const fileName = input.fileName.trim();
  if (!fileName) {
    return { ok: false, error: "Выберите файл прошивки." };
  }
  if (!fileName.toLowerCase().endsWith(FIRMWARE_UPLOAD_ACCEPT)) {
    return { ok: false, error: "Файл прошивки должен быть с расширением .bin." };
  }

  if (input.fileSize <= 0) {
    return { ok: false, error: "Файл прошивки пуст." };
  }
  if (input.fileSize > FIRMWARE_UPLOAD_MAX_BYTES) {
    const limitMb = Math.round(FIRMWARE_UPLOAD_MAX_BYTES / (1024 * 1024));
    return { ok: false, error: `Файл больше ${limitMb} МБ — это не образ BrewForge.` };
  }

  return { ok: true };
};

const FIRMWARE_ERROR_MESSAGES: { match: string; message: (version: string) => string }[] = [
  { match: "RELEASE_ALREADY_EXISTS", message: (v) => `Версия ${v} уже публиковалась — выпустите новую.` },
  { match: "INVALID_VERSION", message: (v) => `Версия «${v}» не semver — ожидается вида 2.1.0 или 2.1.0-dev.` },
  { match: "RELEASE_NOT_FOUND", message: (v) => `Релиз ${v} не найден — обновите страницу.` },
  { match: "FILE_NOT_FOUND", message: () => "Файл прошивки не дошёл до сервера — попробуйте ещё раз." },
  { match: "FIRMWARE_PATH_OUTSIDE_STORAGE", message: () => "Недопустимый путь файла." }
];

/** Ошибки сервиса — коды в тексте Error; наружу отдаём человеческий текст. */
export const mapFirmwareAdminError = (error: unknown, version: string): string => {
  if (error instanceof Error) {
    const found = FIRMWARE_ERROR_MESSAGES.find((entry) => error.message.startsWith(entry.match));
    if (found) {
      return found.message(version);
    }
  }
  return "Не удалось выполнить операцию.";
};

export type FirmwareActor = { id: string; email: string | null };

/**
 * Опубликовать релиз из загруженного файла: publishRelease принимает путь на
 * диске, поэтому буфер сначала кладётся во временный каталог, а после копии в
 * стор удаляется (файл релиза уже живёт в FIRMWARE_STORAGE_DIR).
 */
export const publishFirmwareUpload = async (
  input: FirmwareUploadInput & { bytes: Buffer; actor: FirmwareActor }
): Promise<FirmwareReleaseDto> => {
  const version = input.version.trim();
  const stagingDir = await mkdtemp(path.join(tmpdir(), "nb-firmware-"));
  const stagedPath = path.join(stagingDir, `brewforge-${version}.bin`);

  try {
    await writeFile(stagedPath, input.bytes);
    const release = await publishRelease({
      filePath: stagedPath,
      version,
      notes: input.notes.trim(),
      channel: input.channel,
      protocolSchema: input.protocolSchema
    });

    await recordAuditEvent({
      actorUserId: input.actor.id,
      actorEmail: input.actor.email,
      action: "firmware.publish",
      entityType: "firmware",
      entityId: release.version,
      summary: `Опубликована прошивка ${release.version} (${release.channel})`,
      payload: {
        version: release.version,
        channel: release.channel,
        protocolSchema: release.protocolSchema,
        fileSize: release.fileSize,
        fileSha256: release.fileSha256
      }
    });

    return release;
  } finally {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
  }
};

/** Отозвать релиз: раздача прекращается, запись и файл остаются. */
export const yankFirmwareRelease = async (input: {
  version: string;
  reason: string;
  actor: FirmwareActor;
}): Promise<FirmwareReleaseDto> => {
  const version = input.version.trim();
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("YANK_REASON_REQUIRED");
  }

  const release = await yankRelease(version);

  await recordAuditEvent({
    actorUserId: input.actor.id,
    actorEmail: input.actor.email,
    action: "firmware.yank",
    entityType: "firmware",
    entityId: release.version,
    summary: `Отозвана прошивка ${release.version}: ${reason}`,
    payload: { version: release.version, channel: release.channel, reason }
  });

  return release;
};

type ReleaseRow = typeof firmwareReleases.$inferSelect;

const resolveStatus = (row: ReleaseRow, latestIdByChannel: Map<FirmwareChannel, string>): FirmwareReleaseStatus => {
  if (row.yankedAt !== null) {
    return "yanked";
  }
  if (row.publishedAt === null) {
    return "draft";
  }
  return latestIdByChannel.get(row.channel) === row.id ? "latest" : "published";
};

/**
 * Автор публикации по версиям релизов — одним запросом к журналу (без N+1).
 * Ключ — entityId события (= версия релиза).
 */
const loadPublishers = async (versions: string[]): Promise<Map<string, string>> => {
  if (versions.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      entityId: systemEvents.entityId,
      actorEmail: systemEvents.actorEmail,
      actorDisplayName: users.displayName,
      actorAnonymizedAt: users.anonymizedAt,
      createdAt: systemEvents.createdAt
    })
    .from(systemEvents)
    .leftJoin(users, eq(users.id, systemEvents.actorUserId))
    .where(and(eq(systemEvents.action, "firmware.publish"), inArray(systemEvents.entityId, versions)))
    .orderBy(desc(systemEvents.createdAt));

  const byVersion = new Map<string, string>();
  for (const row of rows) {
    if (!row.entityId || byVersion.has(row.entityId)) {
      continue;
    }
    const displayName = row.actorDisplayName?.trim() || null;
    // Снимок почты обезличенного актора не показываем даже из старых строк журнала.
    const email = row.actorAnonymizedAt === null ? row.actorEmail?.trim() || null : null;
    byVersion.set(row.entityId, displayName ?? email ?? SYSTEM_ACTOR_NAME);
  }
  return byVersion;
};

/**
 * Все релизы для админки, новые сверху. Таблица мелкая (релизы прошивки), поэтому
 * без пагинации — но со статусом «актуальный» на канал (максимальная semver-версия
 * среди опубликованных и не отозванных, ровно как её выбирает раздача манифеста).
 */
export const listAdminFirmwareReleases = async (): Promise<AdminFirmwareRelease[]> => {
  const rows = await db.select().from(firmwareReleases).orderBy(desc(firmwareReleases.createdAt));

  const latestIdByChannel = new Map<FirmwareChannel, string>();
  for (const channel of firmwareChannelSchema.options) {
    const servable = rows.filter(
      (row) => row.channel === channel && row.publishedAt !== null && row.yankedAt === null
    );
    const latest = pickLatestRelease(servable);
    if (latest) {
      latestIdByChannel.set(channel, latest.id);
    }
  }

  const publishers = await loadPublishers(rows.map((row) => row.version));

  return rows.map((row) => {
    const status = resolveStatus(row, latestIdByChannel);
    return {
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
      status,
      statusLabel: firmwareReleaseStatusLabels[status],
      publishedByName: publishers.get(row.version) ?? null
    };
  });
};

