// =============================================================================
//  features/device-streams — parse-core.ts
//  Автодетект + парсинг трёх пуш-форматов сторонних устройств ферментации по
//  полям тела (docs/specs/third-party-fermentation-devices.md §8.2). Чистое
//  ядро без БД/сети — колокированный тест рядом (конвенция *-core.ts, см.
//  features/devices/fermenter-binding-core.ts). Единицы НЕ нормализуются здесь
//  (см. normalize-core.ts) — тут только детект формата и терпимое чтение полей.
// =============================================================================

/** Один пуш-пакет, приведённый к общей форме — но ещё в единицах устройства. */
export type ParsedStreamPacket = {
  format: "ispindel" | "brewfather" | "tilt";
  /** Имя, которым устройство называет себя в пакете (для Tilt — цветовой канал). */
  name: string | null;
  gravityRaw: number | null;
  gravityUnitHint: "sg" | "plato" | null;
  temperatureRaw: number | null;
  temperatureUnitHint: "c" | "f" | null;
  pressureRaw: number | null;
  pressureUnitHint: "psi" | "kpa" | null;
  /** Вольты ИЛИ проценты — какая шкала решает normalize-core по величине. */
  batteryRaw: number | null;
  rssi: number | null;
  /** iSpindel шлёт интервал между замерами (сек) — нужен для порога «молчит» (§П4). */
  intervalSeconds: number | null;
  /** Время источника (Tilt Timepoint → Date). У iSpindel/Brewfather stream своего нет. */
  sourceTs: Date | null;
};

export type ParseResult =
  | { ok: true; packet: ParsedStreamPacket }
  | { ok: false; error: "unknown_format" | "invalid_body" };

// -----------------------------------------------------------------------------
//  Терпимое чтение значений: число или числовая строка → число, мусор → null.
//  Датчики в поле — не доверенный ввод (прошивки, кастомные сборки), падать на
//  кривом значении нельзя — пакет должен сохраниться с тем, что смогли прочесть.
// -----------------------------------------------------------------------------

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const toGravityUnitHint = (value: unknown): "sg" | "plato" | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "G") return "sg";
  if (normalized === "P") return "plato";
  return null;
};

const toTemperatureUnitHint = (value: unknown): "c" | "f" | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "C") return "c";
  if (normalized === "F") return "f";
  return null;
};

const toPressureUnitHint = (value: unknown): "psi" | "kpa" | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "PSI") return "psi";
  if (normalized === "KPA") return "kpa";
  return null;
};

/** Excel-серийная дата (эпоха 1899-12-30) → Date. Невалидная/отсутствующая → null. */
const EXCEL_EPOCH_OFFSET_DAYS = 25569; // дней между 1899-12-30 и 1970-01-01 (Unix-эпоха)
const SECONDS_PER_DAY = 86400;

const parseTiltTimepoint = (value: unknown): Date | null => {
  const serial = toNumberOrNull(value);
  if (serial === null) return null;
  const ms = Math.round((serial - EXCEL_EPOCH_OFFSET_DAYS) * SECONDS_PER_DAY * 1000);
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Пакет присутствует как непустой объект (не массив/null/примитив). */
type PacketRecord = Record<string, unknown>;

const hasField = (record: PacketRecord, key: string): boolean => record[key] !== undefined;

// -----------------------------------------------------------------------------
//  Детект + парс. Порядок проверок фиксирован спекой (§8.2): iSpindel → Brewfather
//  stream → Tilt → unknown_format. Ключи регистро- и написанием различаются между
//  форматами (angle/temperature vs temp/gravity vs Temp/SG), поэтому проверки не
//  пересекаются на эталонных пакетах.
// -----------------------------------------------------------------------------

export const parseStreamPacket = (body: unknown): ParseResult => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const record = body as PacketRecord;

  // iSpindel native (сток-прошивка и GravityMon в native-режиме).
  if (hasField(record, "angle") && hasField(record, "temperature")) {
    return {
      ok: true,
      packet: {
        format: "ispindel",
        name: toStringOrNull(record.name),
        gravityRaw: toNumberOrNull(record.gravity),
        // GravityMon: ключ с дефисом, не подчёркиванием — "gravity-unit".
        gravityUnitHint: toGravityUnitHint(record["gravity-unit"]),
        temperatureRaw: toNumberOrNull(record.temperature),
        temperatureUnitHint: toTemperatureUnitHint(record.temp_units),
        pressureRaw: null,
        pressureUnitHint: null,
        batteryRaw: toNumberOrNull(record.battery),
        rssi: toNumberOrNull(record.RSSI),
        intervalSeconds: toNumberOrNull(record.interval),
        sourceTs: null
      }
    };
  }

  // Brewfather custom stream (Floaty, BrewPiLess, MyBrewbot, PressureMon…).
  if (hasField(record, "name") && (hasField(record, "temp") || hasField(record, "gravity"))) {
    return {
      ok: true,
      packet: {
        format: "brewfather",
        name: toStringOrNull(record.name),
        gravityRaw: toNumberOrNull(record.gravity),
        gravityUnitHint: toGravityUnitHint(record.gravity_unit),
        temperatureRaw: toNumberOrNull(record.temp),
        temperatureUnitHint: toTemperatureUnitHint(record.temp_unit),
        pressureRaw: toNumberOrNull(record.pressure),
        pressureUnitHint: toPressureUnitHint(record.pressure_unit),
        batteryRaw: toNumberOrNull(record.battery),
        rssi: null,
        intervalSeconds: null,
        sourceTs: null
      }
    };
  }

  // Tilt cloud logging (через приложение Tilt 2 / TiltPi / TiltBridge).
  if (hasField(record, "SG") && hasField(record, "Temp")) {
    return {
      ok: true,
      packet: {
        format: "tilt",
        // У Tilt нет отдельного «имени устройства» — цветовой канал (Color)
        // и есть тот самый идентификатор конкретного поплавка (Tilt Red/Black/…).
        name: toStringOrNull(record.Color),
        gravityRaw: toNumberOrNull(record.SG),
        gravityUnitHint: "sg",
        temperatureRaw: toNumberOrNull(record.Temp),
        temperatureUnitHint: "f",
        pressureRaw: null,
        pressureUnitHint: null,
        batteryRaw: null,
        rssi: null,
        intervalSeconds: null,
        sourceTs: parseTiltTimepoint(record.Timepoint)
      }
    };
  }

  return { ok: false, error: "unknown_format" };
};
