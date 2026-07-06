// =============================================================================
//  @nb/brewforge-protocol — update.ts
//  OTA-обновления прошивки (docs/brewforge-firmware-releases.md §5.3):
//  retained-сообщение brewforge/<deviceId>/update (портал → устройство) +
//  semver-компаратор и чистое решение «предложить/очистить» для моста.
//
//  Добавление топика/сообщения — АДДИТИВНО, schema остаётся 1 (§2 спеки: bump
//  BF_PROTO_SCHEMA только при ломающем изменении сообщений).
//
//  Компаратор/решение живут здесь (а не в apps/web) по тому же принципу, что
//  persist-gate.ts/watchdog.ts: чистая логика, нужная И порталу, И мосту,
//  тестируется юнитами без БД/IO. apps/web/features/firmware/versions.ts
//  реэкспортирует компаратор как своё публичное API.
// =============================================================================
import { z } from "zod";

import { PROTOCOL_SCHEMA_VERSION } from "./enums.js";

/**
 * Payload retained-топика brewforge/<deviceId>/update. Пустой retained =
 * очистка («обновлений нет»). Контракт зафиксирован спекой §5.3.
 */
export const FirmwareUpdateMessageSchema = z.object({
  schema: z.literal(PROTOCOL_SCHEMA_VERSION),
  version: z.string(),               // semver релиза ("2.1.0")
  url: z.string().url(),             // абсолютный URL скачивания .bin
  sha256: z.string(),                // hex-дайджест образа
  size: z.number().int().positive(), // размер .bin, байт
  protocolSchema: z.number().int(),  // schema, с которой собран релиз
  notes: z.string(),                 // changelog по-русски (показывается пользователю)
});
export type FirmwareUpdateMessage = z.infer<typeof FirmwareUpdateMessageSchema>;

// ----------------------------- Semver-компаратор ---------------------------

/** Разобранный semver: числовая тройка + prerelease-идентификаторы (пусто = релиз). */
export type ParsedFirmwareVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/** Разобрать строку semver ("2.1.0", "2.1.0-dev.3"). null — не semver. */
export function parseFirmwareVersion(raw: string): ParsedFirmwareVersion | null {
  const m = SEMVER_RE.exec(raw.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split(".") : [],
  };
}

/** Сравнение prerelease-идентификаторов по правилам semver §11. */
function comparePrerelease(a: string[], b: string[]): number {
  // Отсутствие prerelease > наличие (2.1.0 > 2.1.0-dev).
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const ai = a[i];
    const bi = b[i];
    // Более короткий набор идентификаторов < более длинного (1.0.0-a < 1.0.0-a.1).
    if (ai === undefined) return -1;
    if (bi === undefined) return 1;
    const aNum = /^\d+$/.test(ai);
    const bNum = /^\d+$/.test(bi);
    if (aNum && bNum) {
      const diff = Number(ai) - Number(bi);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    } else if (aNum !== bNum) {
      return aNum ? -1 : 1; // числовые идентификаторы < буквенных
    } else if (ai !== bi) {
      return ai < bi ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Semver-компаратор версий прошивки: <0, 0, >0 (a < b, a == b, a > b).
 * Prerelease МЛАДШЕ релиза той же тройки: 2.1.0-dev < 2.1.0.
 * Бросает на не-semver входе — валидируйте parseFirmwareVersion'ом заранее.
 */
export function compareFirmwareVersions(a: string, b: string): number {
  const pa = parseFirmwareVersion(a);
  const pb = parseFirmwareVersion(b);
  if (!pa || !pb) {
    throw new Error(`compareFirmwareVersions: не semver ("${a}" vs "${b}")`);
  }
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return comparePrerelease(pa.prerelease, pb.prerelease);
}

// ----------------------------- Решение моста -------------------------------

/**
 * Решение моста по паре (fw устройства, последний stable-релиз):
 *  - "offer" — у устройства старее: публиковать retained update + уведомить;
 *  - "clear" — устройство догнало/обогнало релиз: если ранее публиковали
 *    retained update, опубликовать пустой retained (очистка);
 *  - "none"  — решать нечего (fw неизвестен/не semver, релизов нет).
 * Чистая функция; память «публиковали ли уже» — у вызывающего (in-memory моста).
 */
export function decideFirmwareUpdate(
  currentFw: string | null | undefined,
  latestVersion: string | null | undefined,
): "offer" | "clear" | "none" {
  if (!currentFw || !latestVersion) return "none";
  const current = parseFirmwareVersion(currentFw);
  const latest = parseFirmwareVersion(latestVersion);
  if (!current || !latest) return "none";
  return compareFirmwareVersions(currentFw, latestVersion) < 0 ? "offer" : "clear";
}
