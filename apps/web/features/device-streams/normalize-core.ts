import { platoToSg } from "@nb/brewing-core";

import type { ParsedStreamPacket } from "./parse-core";

// =============================================================================
//  features/device-streams — normalize-core.ts
//  Нормализация единиц пакета в единый вид для хранения (§8.3): SG/°C/кПа/В/%.
//  Чистое ядро, колокированный тест рядом. Плотность SG↔Plato переиспользует
//  готовую полиномиальную конверсию platoToSg из @nb/brewing-core (та же формула,
//  что use в features/system/gravity-units.ts) — не дублируем её здесь.
// =============================================================================

export type NormalizedReading = {
  gravitySg: number | null;
  tempC: number | null;
  pressureKpa: number | null;
  /** iSpindel/Brewfather-стрим шлют вольты. */
  batteryV: number | null;
  /** RAPT шлёт проценты. */
  batteryPct: number | null;
  rssi: number | null;
};

const PSI_TO_KPA = 6.8948;

// Эвристика при отсутствии явного unit-hint: физически SG почти никогда не
// превышает ~1.2 (это уже сироп), поэтому значение выше порога — Plato.
const GRAVITY_HEURISTIC_SG_CEILING = 1.2;

// Плаузибилити-клампы (§8.3): точка сохраняется в payload всегда, но
// нормализованное поле обнуляется — мусор с датчика не должен ломать график/вердикт.
const GRAVITY_PLAUSIBLE_MIN_SG = 0.98;
const GRAVITY_PLAUSIBLE_MAX_SG = 1.2;
const TEMP_PLAUSIBLE_MIN_C = -10;
const TEMP_PLAUSIBLE_MAX_C = 50;

// Батарея: iSpindel/Floaty шлют вольты (обычно 3.0-4.2 В у li-ion), RAPT — проценты
// (0-100). Порог 6 однозначно разделяет шкалы — вольты Li-ion физически ниже.
const BATTERY_VOLTAGE_MAX = 6;

const normalizeGravity = (raw: number | null, hint: "sg" | "plato" | null): number | null => {
  if (raw === null) return null;
  if (hint === "plato") return platoToSg(raw);
  if (hint === "sg") return raw;
  return raw > GRAVITY_HEURISTIC_SG_CEILING ? platoToSg(raw) : raw;
};

const normalizeTemperature = (raw: number | null, hint: "c" | "f" | null): number | null => {
  if (raw === null) return null;
  if (hint === "f") return ((raw - 32) * 5) / 9;
  return raw;
};

const normalizePressure = (raw: number | null, hint: "psi" | "kpa" | null): number | null => {
  if (raw === null) return null;
  if (hint === "psi") return raw * PSI_TO_KPA;
  return raw;
};

const normalizeBattery = (raw: number | null): Pick<NormalizedReading, "batteryV" | "batteryPct"> => {
  if (raw === null) return { batteryV: null, batteryPct: null };
  return raw <= BATTERY_VOLTAGE_MAX ? { batteryV: raw, batteryPct: null } : { batteryV: null, batteryPct: raw };
};

const clampGravity = (value: number | null): number | null => {
  if (value === null) return null;
  return value >= GRAVITY_PLAUSIBLE_MIN_SG && value <= GRAVITY_PLAUSIBLE_MAX_SG ? value : null;
};

const clampTemperature = (value: number | null): number | null => {
  if (value === null) return null;
  return value >= TEMP_PLAUSIBLE_MIN_C && value <= TEMP_PLAUSIBLE_MAX_C ? value : null;
};

export const normalizeStreamPacket = (packet: ParsedStreamPacket): NormalizedReading => {
  const gravitySg = clampGravity(normalizeGravity(packet.gravityRaw, packet.gravityUnitHint));
  const tempC = clampTemperature(normalizeTemperature(packet.temperatureRaw, packet.temperatureUnitHint));
  const pressureKpa = normalizePressure(packet.pressureRaw, packet.pressureUnitHint);
  const { batteryV, batteryPct } = normalizeBattery(packet.batteryRaw);

  return { gravitySg, tempC, pressureKpa, batteryV, batteryPct, rssi: packet.rssi };
};

// =============================================================================
//  Ветхость данных устройства (П4): «нет связи» — независимо от онлайн/офлайн
//  статуса брокера, это про отсутствие свежих ТОЧЕК брожения на графике/плитке.
// =============================================================================

const STALE_THRESHOLD_MULTIPLIER = 3;
/** Интервал по умолчанию, когда устройство не сообщило свой (сек) — 1 час. */
const DEFAULT_INTERVAL_SECONDS = 3600;

/** Порог «молчит», мс: 3× заявленный интервал; неизвестен — 3× 3600×1000 (3 часа). */
export const staleThresholdMs = (intervalSeconds: number | null): number => {
  const seconds = intervalSeconds !== null && intervalSeconds > 0 ? intervalSeconds : DEFAULT_INTERVAL_SECONDS;
  return STALE_THRESHOLD_MULTIPLIER * seconds * 1000;
};

/** true, если с последнего известного показания устройства прошло больше порога. */
export const isStale = (lastSeenAt: Date | null, intervalSeconds: number | null, now: Date): boolean => {
  if (lastSeenAt === null) return true;
  const ageMs = now.getTime() - lastSeenAt.getTime();
  return ageMs >= staleThresholdMs(intervalSeconds);
};
