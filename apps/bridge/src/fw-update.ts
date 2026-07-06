// =============================================================================
//  apps/bridge — fw-update.ts
//  Детектор OTA-обновлений (F3, docs/brewforge-firmware-releases.md §5.3/§6).
//  На кадрах телеметрии/статуса с известным fw сравнивает версию устройства с
//  последним stable-релизом (кэш из БД, TTL 5 мин) и:
//   (а) публикует retained brewforge/<id>/update с payload обновления — не чаще
//       одного раза на пару (device, version) за жизнь процесса (in-memory map);
//   (б) шлёт владельцу web-push «Доступно обновление BrewForge X.Y.Z» — дедуп
//       через brew_devices.update_notified_fw (переживает рестарты моста).
//  Когда устройство догнало/обогнало релиз и retained публиковали МЫ в этой
//  сессии — публикуем пустой retained (очистка «доступно обновление»).
//
//  Решение «offer/clear/none» — чистая decideFirmwareUpdate из
//  @nb/brewforge-protocol (юнит-тесты там же — паттерн persist-gate/watchdog).
//  Оборонительность как у всего моста: любой сбой логируется, кадр не роняет.
// =============================================================================
import {
  PROTOCOL_SCHEMA_VERSION,
  compareFirmwareVersions,
  decideFirmwareUpdate,
  parseFirmwareVersion,
  type FirmwareUpdateMessage,
} from "@nb/brewforge-protocol";
import { firmwareUpdateNotification, sendPushToUser } from "@nb/push";

import {
  and,
  brewDevices,
  db,
  eq,
  firmwareReleases,
  isNotNull,
  isNull,
  type DeviceRow,
} from "./db.js";

/** Публикация retained-сообщения .../update; payload null = очистка. */
export type PublishUpdateFn = (hardwareId: string, payload: string | null) => Promise<void>;

type LatestRelease = {
  version: string;
  notes: string;
  fileSha256: string;
  fileSize: number;
  protocolSchema: number;
};

// --- Кэш последнего stable-релиза (TTL 5 мин; null-результат тоже кэшируется,
// чтобы пустой реестр не превращался в SELECT на каждый кадр телеметрии).
const RELEASE_CACHE_TTL_MS = 5 * 60_000;
let releaseCache: { at: number; release: LatestRelease | null } | null = null;

// deviceId (db-id) → версия, которую ЭТОТ процесс уже публиковал в retained
// .../update (гейт «once per (device, version)» + память для очистки).
const publishedUpdates = new Map<string, string>();

/** База абсолютных ссылок портала — тот же APP_URL, что у apps/web (@nb/shared). */
function appBaseUrl(): string {
  const raw = process.env.APP_URL;
  return (raw && raw.length > 0 ? raw : "http://localhost:3000").replace(/\/+$/, "");
}

async function getLatestStableRelease(nowMs: number): Promise<LatestRelease | null> {
  if (releaseCache && nowMs - releaseCache.at < RELEASE_CACHE_TTL_MS) {
    return releaseCache.release;
  }

  const rows = await db
    .select({
      version: firmwareReleases.version,
      notes: firmwareReleases.notes,
      fileSha256: firmwareReleases.fileSha256,
      fileSize: firmwareReleases.fileSize,
      protocolSchema: firmwareReleases.protocolSchema,
    })
    .from(firmwareReleases)
    .where(
      and(
        eq(firmwareReleases.providerId, "brewforge"),
        eq(firmwareReleases.channel, "stable"),
        isNotNull(firmwareReleases.publishedAt),
        isNull(firmwareReleases.yankedAt),
      ),
    );

  // Максимальная semver-версия (не дата публикации: hotfix старой ветки не
  // должен перекрыть новую); не-semver строки игнорируем.
  let latest: LatestRelease | null = null;
  for (const row of rows) {
    if (parseFirmwareVersion(row.version) === null) continue;
    if (latest === null || compareFirmwareVersions(row.version, latest.version) > 0) {
      latest = row;
    }
  }

  releaseCache = { at: nowMs, release: latest };
  return latest;
}

/** Payload retained .../update по контракту §5.3. */
function buildUpdatePayload(release: LatestRelease): FirmwareUpdateMessage {
  return {
    schema: PROTOCOL_SCHEMA_VERSION,
    version: release.version,
    url: `${appBaseUrl()}/api/firmware/download/${encodeURIComponent(release.version)}`,
    sha256: release.fileSha256,
    size: release.fileSize,
    protocolSchema: release.protocolSchema,
    notes: release.notes,
  };
}

/** Web-push владельцу с дедупом через brew_devices.update_notified_fw. */
async function notifyOwnerOnce(device: DeviceRow, version: string): Promise<void> {
  const [row] = await db
    .select({ updateNotifiedFw: brewDevices.updateNotifiedFw })
    .from(brewDevices)
    .where(eq(brewDevices.id, device.id))
    .limit(1);
  if (!row || row.updateNotifiedFw === version) return;

  const sent = await sendPushToUser(
    device.userId,
    firmwareUpdateNotification({ deviceId: device.id, deviceName: device.name }, version),
  );
  await db
    .update(brewDevices)
    .set({ updateNotifiedFw: version, updatedAt: new Date() })
    .where(eq(brewDevices.id, device.id));
  console.log(`[fw-update] ${device.hardwareId}: доступно ${version} → push x${sent}`);
}

/**
 * Обработать известный fw устройства (кадр телеметрии/статуса): опубликовать/
 * очистить retained .../update и уведомить владельца. Best-effort — сбой
 * логируется, наружу не бросается (§оборонительность mqtt.ts).
 */
export async function maintainFirmwareUpdate(
  device: DeviceRow,
  fw: string | null | undefined,
  publishUpdate: PublishUpdateFn,
  nowMs: number = Date.now(),
): Promise<void> {
  try {
    const latest = await getLatestStableRelease(nowMs);
    const decision = decideFirmwareUpdate(fw ?? null, latest?.version ?? null);

    if (decision === "offer" && latest) {
      // Once per (device, version) за жизнь процесса: и retained, и пуш-проверка
      // проходят под одним гейтом (retained идемпотентен, пуш дедупится колонкой).
      if (publishedUpdates.get(device.id) === latest.version) return;
      await publishUpdate(device.hardwareId, JSON.stringify(buildUpdatePayload(latest)));
      publishedUpdates.set(device.id, latest.version);
      await notifyOwnerOnce(device, latest.version);
      return;
    }

    if (decision === "clear" && publishedUpdates.has(device.id)) {
      // Устройство догнало релиз (обновилось) — снимаем retained «доступно
      // обновление», который публиковали в этой сессии.
      await publishUpdate(device.hardwareId, null);
      publishedUpdates.delete(device.id);
      console.log(`[fw-update] ${device.hardwareId}: fw=${fw} актуальна, retained update очищен`);
    }
  } catch (err) {
    console.error("[fw-update] сбой:", err instanceof Error ? err.message : String(err));
  }
}
