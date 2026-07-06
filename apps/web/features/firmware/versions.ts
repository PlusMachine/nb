// =============================================================================
//  features/firmware/versions.ts
//  Semver-компаратор версий прошивки (F2, docs/brewforge-firmware-releases.md §3).
//  Каноническая реализация живёт в @nb/brewforge-protocol (update.ts) — она нужна
//  и мосту (apps/bridge не может импортировать apps/web), тот же паттерн, что
//  persist-gate/watchdog. Здесь — публичное API фичи: web-код (сервис, роуты,
//  CLI-публикация) импортирует компаратор отсюда, а не из протокольного пакета.
//  Чистые функции без БД/IO; prerelease МЛАДШЕ релиза: 2.1.0-dev < 2.1.0.
// =============================================================================
export {
  compareFirmwareVersions,
  parseFirmwareVersion,
  type ParsedFirmwareVersion,
} from "@nb/brewforge-protocol";

import { compareFirmwareVersions, parseFirmwareVersion } from "@nb/brewforge-protocol";

/** true — строка является валидным semver ("2.1.0", "2.1.0-dev.3"). */
export function isValidFirmwareVersion(raw: string): boolean {
  return parseFirmwareVersion(raw) !== null;
}

/** true — candidate строго новее current (оба должны быть валидным semver). */
export function isNewerFirmwareVersion(candidate: string, current: string): boolean {
  return compareFirmwareVersions(candidate, current) > 0;
}

/**
 * Выбрать релиз с максимальной версией (semver, не дата публикации: hotfix
 * 2.0.4 может быть опубликован ПОЗЖЕ 2.1.0 и не должен его перекрыть).
 * Строки с не-semver версией игнорируются. Чистая функция — живёт здесь
 * (модуль без импорта БД), сервис передаёт уже отфильтрованные published-строки.
 */
export function pickLatestRelease<T extends { version: string }>(rows: T[]): T | null {
  let latest: T | null = null;
  for (const row of rows) {
    if (parseFirmwareVersion(row.version) === null) continue;
    if (latest === null || compareFirmwareVersions(row.version, latest.version) > 0) {
      latest = row;
    }
  }
  return latest;
}
