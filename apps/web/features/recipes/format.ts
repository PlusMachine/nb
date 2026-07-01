import { srmToEbc } from "@nb/brewing-core";

const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

const relativeFormatter = new Intl.RelativeTimeFormat("ru-RU", { numeric: "auto" });

const formatNumber = (value: number, precision = 1) => value.toFixed(precision).replace(/\.0$/, "");

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


/** Объём партии в литрах: `20 л` / `19,5 л` (RU-запятая). `null → "—"`. */
export const formatBatchVolume = (liters: number | null) => (
  liters == null ? "—" : `${volumeFormatter.format(liters)} л`
);

/** Окно (в днях), в течение которого рецепт считается «Новым» на витрине. */
export const NEW_RECIPE_WINDOW_DAYS = 30;

/**
 * Создан ли рецепт недавно — для бейджа «Новый» на карточке/строке витрины.
 * `iso` — ISO-таймстамп создания (`PublicRecipeListItem.createdAt`).
 */
export const isRecentlyCreated = (iso: string, now: Date = new Date()): boolean => {
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) {
    return false;
  }
  return now.getTime() - created <= NEW_RECIPE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
};
