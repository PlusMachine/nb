import { sgToPlato, srmToEbc } from "@nb/brewing-core";

const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

const relativeFormatter = new Intl.RelativeTimeFormat("ru-RU", { numeric: "auto" });

const formatNumber = (value: number, precision = 1) => value.toFixed(precision).replace(/\.0$/, "");

export const formatPlatoFromSg = (value: number, precision = 1) => (
  `${Math.max(0, sgToPlato(value, precision)).toFixed(precision)} °P`
);

export const formatBrixFromSg = (value: number, precision = 1) => (
  `${Math.max(0, sgToPlato(value, precision)).toFixed(precision)} °Bx`
);

export const formatGravityWithPlato = (value: number | null) => (
  value == null
    ? "—"
    : `${value.toFixed(3)} (${formatPlatoFromSg(value, 1)})`
);

export const formatColorWithEbc = (value: number | null) => (
  value == null
    ? "—"
    : `${formatNumber(value, 1)} SRM (${formatNumber(srmToEbc(value), 0)} EBC)`
);

export const formatRecipeTimestamp = (value: Date) => dateTimeFormatter.format(value);

export const formatRelativeTimestamp = (value: Date, now = new Date()) => {
  const diffMs = value.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  const absMinutes = Math.abs(diffMinutes);

  if (absMinutes < 60) {
    return relativeFormatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  const absHours = Math.abs(diffHours);
  if (absHours < 24) {
    return relativeFormatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  return relativeFormatter.format(diffDays, "day");
};

export const formatUpdatedLabel = (value: Date, now = new Date()) => (
  `${formatRecipeTimestamp(value)} • обновлён ${formatRelativeTimestamp(value, now)}`
);

// --- Компактные форматтеры для карточки витрины /recipes --------------------

const decimalFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

const volumeFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1
});

/** ABV в виде `6,2 %` (RU-запятая, 1 знак). `null → "—"`. */
export const formatAbvShort = (value: number | null) => (
  value == null ? "—" : `${decimalFormatter.format(value)} %`
);

/** IBU как целое число. `null → "—"`. */
export const formatIbuShort = (value: number | null) => (
  value == null ? "—" : `${Math.round(value)}`
);

/**
 * OG в гравитационной конвенции `1.048` (точка, 3 знака — как
 * {@link formatGravityWithPlato}). `null → "—"`.
 */
export const formatOgShort = (value: number | null) => (
  value == null ? "—" : value.toFixed(3)
);

/** Объём партии в литрах: `20 л` / `19,5 л` (RU-запятая). `null → "—"`. */
export const formatBatchVolume = (liters: number | null) => (
  liters == null ? "—" : `${volumeFormatter.format(liters)} л`
);
