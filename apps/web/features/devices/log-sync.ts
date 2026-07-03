import crypto from "node:crypto";

import { and, brewLogEvents, brewTelemetry, db, deviceLogFiles, eq } from "@nb/db";
import { parseLogJsonl, type DeviceLogFileMeta } from "@nb/brewforge-protocol";

import { getProviderForDevice } from "@/features/brew-controller";

import { getDeviceById } from "./service";

// =============================================================================
//  features/devices/log-sync.ts
//  Пакет 4-B, P3 (notes/audit/comms-portal.md: «Офлайн-варка не оставляет следа
//  в портале»). Догрузка офлайн-журнала варки (bf_log.c, GET /log[?name=] на
//  устройстве, LAN-only) в brew_telemetry/brew_log_events — минимальный полезный
//  путь: РУЧНАЯ синхронизация (кнопка на странице устройства), без облачного
//  довыгрузочного протокола (D7 из аудита — расширение MQTT .../log под seq-
//  курсор — остаётся бэклогом, вне scope этого пакета: LAN-путь уже закрывает
//  главный кейс «варка без сети совсем»).
//
//  Идемпотентность в ДВА уровня:
//   1) Реестр `device_log_files` (deviceId,name) — если sizeBytes НЕ изменился с
//      прошлой синхронизации, файл считается полностью догруженным и пропускается
//      целиком (см. shouldSkipFile). Открытый файл РАСТЁТ, пока варка идёт — рост
//      size триггерит повторный разбор ВСЕГО файла (не диффом).
//   2) Строки внутри файла — при повторном разборе того же контента дедуп на
//      уровне БД: сэмплы получают ДЕТЕРМИНИРОВАННЫЙ (из sha256 хэша
//      deviceId+file+индекс-в-своём-потоке) отрицательный `seq`
//      (brew_telemetry.seq у живой телеметрии ВСЕГДА положителен — счётчик
//      comms_task с нуля — коллизия исключена по конструкции), события —
//      детерминированный uuid как PRIMARY KEY. onConflictDoNothing на обоих →
//      повторный разбор строки, которая уже была вставлена, — no-op.
//  Порядок «сэмплы/события внутри файла» СТАБИЛЕН между запусками (parseLogJsonl
//  детерминирован, новый контент только ДОПИСЫВАЕТСЯ в конец SPIFFS-файла) — индекс
//  элемента внутри его типизированного потока (i-й сэмпл / j-е событие), а не
//  абсолютный номер строки файла, тоже стабилен и годится как компонент ключа.
// =============================================================================

/** true — файл уже полностью синхронизирован (тот же размер, что в прошлый раз). */
export function shouldSkipFile(
  existing: { sizeBytes: number } | undefined,
  remote: { sizeBytes: number },
): boolean {
  return existing !== undefined && existing.sizeBytes === remote.sizeBytes;
}

/** sha256(deviceId:fileName:kind:indexInStream) — стабильный «отпечаток» строки лога. */
function lineDigest(deviceId: string, fileName: string, kind: "s" | "e", indexInStream: number): Buffer {
  return crypto.createHash("sha256").update(`${deviceId}:${fileName}:${kind}:${indexInStream}`).digest();
}

/** Детерминированный отрицательный int32 seq для brew_telemetry (никогда не 0, никогда не коллидирует с живым положительным seq). */
export function deterministicSeq(digest: Buffer): number {
  const uint31 = digest.readUInt32BE(0) & 0x7fffffff; // 0..2147483647
  return -(uint31 + 1); // −1..−2147483648 — весь диапазон валиден для Postgres integer
}

/** Детерминированный uuid-подобный id (для brew_log_events.id как PK — идемпотентная вставка). */
export function deterministicUuid(digest: Buffer): string {
  const hex = digest.toString("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export type LogSyncFileResult = {
  name: string;
  status: "skipped" | "imported" | "failed";
  samplesImported: number;
  eventsImported: number;
  malformedLines: number;
  error?: string;
};

export type LogSyncSummary = {
  filesOnDevice: number;
  filesImported: number;
  filesSkipped: number;
  filesFailed: number;
  files: LogSyncFileResult[];
};

/**
 * Синхронизировать офлайн-журнал устройства (все файлы, GET /log список) в
 * brew_telemetry/brew_log_events. Ownership-checked (getDeviceById). LAN-only —
 * бросает LOG_SYNC_UNSUPPORTED для устройств без localUrl/облачного транспорта
 * (провайдер тогда не реализует listLogs/readLog, см. brewforge-provider.ts).
 *
 * brewBatchId — опционально: если вызвано со страницы конкретной партии,
 * ВСЕ новоимпортированные строки привязываются к ней; без него (со страницы
 * устройства) — null (видно в истории устройства, getDeviceHistory уже читает
 * brew_telemetry по deviceId независимо от партии).
 */
export async function syncDeviceLog(input: {
  userId: string;
  deviceId: string;
  brewBatchId?: string | null;
}): Promise<LogSyncSummary> {
  const device = await getDeviceById(input.userId, input.deviceId);
  if (!device) throw new Error("NOT_FOUND");

  const provider = getProviderForDevice(device);
  if (!provider?.listLogs || !provider.readLog) {
    throw new Error("LOG_SYNC_UNSUPPORTED");
  }

  const remoteFiles = await provider.listLogs({ userId: input.userId, deviceId: device.id });

  const existingRows = await db
    .select({ name: deviceLogFiles.name, sizeBytes: deviceLogFiles.sizeBytes })
    .from(deviceLogFiles)
    .where(eq(deviceLogFiles.deviceId, device.id));
  const existingByName = new Map(existingRows.map((row) => [row.name, row]));

  const results: LogSyncFileResult[] = [];

  for (const file of remoteFiles) {
    const existing = existingByName.get(file.name);
    if (shouldSkipFile(existing, file)) {
      results.push({ name: file.name, status: "skipped", samplesImported: 0, eventsImported: 0, malformedLines: 0 });
      continue;
    }

    try {
      const imported = await importLogFile(input.userId, device.id, file, input.brewBatchId ?? null, provider);
      results.push({ name: file.name, status: "imported", ...imported });
    } catch (error) {
      results.push({
        name: file.name,
        status: "failed",
        samplesImported: 0,
        eventsImported: 0,
        malformedLines: 0,
        error: error instanceof Error ? error.message.slice(0, 200) : "SYNC_FAILED",
      });
    }
  }

  return {
    filesOnDevice: remoteFiles.length,
    filesImported: results.filter((r) => r.status === "imported").length,
    filesSkipped: results.filter((r) => r.status === "skipped").length,
    filesFailed: results.filter((r) => r.status === "failed").length,
    files: results,
  };
}

async function importLogFile(
  userId: string,
  deviceId: string,
  file: DeviceLogFileMeta,
  brewBatchId: string | null,
  provider: NonNullable<ReturnType<typeof getProviderForDevice>>,
): Promise<{ samplesImported: number; eventsImported: number; malformedLines: number }> {
  // readLog провайдера снова ownership-checked (loadDevice(userId, deviceId)
  // внутри brewforge-provider.ts) — передаём настоящий userId, не полагаемся на
  // то, что device уже был зарезолвлен выше в syncDeviceLog.
  const content = await provider.readLog!({ userId, deviceId, name: file.name });
  if (content === null) {
    throw new Error("устройство не отдало файл (мог быть вытеснен ретеншном между list и read)");
  }

  const parsed = parseLogJsonl(content);

  if (parsed.samples.length > 0) {
    await db
      .insert(brewTelemetry)
      .values(
        parsed.samples.map((sample, i) => {
          const digest = lineDigest(deviceId, file.name, "s", i);
          const tsMs = sample.ts > 0 ? sample.ts * 1000 : (file.startTs > 0 ? file.startTs : Date.now() / 1000) * 1000 + sample.up * 1000;
          return {
            deviceId,
            brewBatchId,
            ts: new Date(tsMs),
            seq: deterministicSeq(digest),
            stage: sample.st,
            primaryC: sample.tp,
            setpointC: sample.sp,
            heatDutyPct: sample.hd,
            payload: { ...sample, source: "log-import", file: file.name } as Record<string, unknown>,
          };
        }),
      )
      .onConflictDoNothing({
        target: [brewTelemetry.deviceId, brewTelemetry.brewBatchId, brewTelemetry.seq],
      });
  }

  if (parsed.events.length > 0) {
    await db
      .insert(brewLogEvents)
      .values(
        parsed.events.map((event, j) => {
          const digest = lineDigest(deviceId, file.name, "e", j);
          const tsMs = event.ts > 0 ? event.ts * 1000 : (file.startTs > 0 ? file.startTs : Date.now() / 1000) * 1000 + event.up * 1000;
          return {
            id: deterministicUuid(digest),
            deviceId,
            brewBatchId,
            ts: new Date(tsMs),
            type: `log:${event.ev}`,
            payload: { ...event, source: "log-import", file: file.name } as Record<string, unknown>,
          };
        }),
      )
      .onConflictDoNothing({ target: brewLogEvents.id });
  }

  await db
    .insert(deviceLogFiles)
    .values({
      deviceId,
      brewBatchId,
      name: file.name,
      sizeBytes: file.sizeBytes,
      samplesImported: parsed.samples.length,
      eventsImported: parsed.events.length,
      malformedLines: parsed.malformedLines,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [deviceLogFiles.deviceId, deviceLogFiles.name],
      set: {
        sizeBytes: file.sizeBytes,
        samplesImported: parsed.samples.length,
        eventsImported: parsed.events.length,
        malformedLines: parsed.malformedLines,
        updatedAt: new Date(),
      },
    });

  return {
    samplesImported: parsed.samples.length,
    eventsImported: parsed.events.length,
    malformedLines: parsed.malformedLines,
  };
}
