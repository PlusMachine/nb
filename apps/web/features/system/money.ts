import {
  convertCurrencyMinorToRubMinor,
  systemCurrencies,
  type SystemCurrency,
  type SystemCurrencyRateMap
} from "./currency";

export const defaultPreferredCurrency: SystemCurrency = "RUB";

const currencyLocales: Record<SystemCurrency, string> = {
  RUB: "ru-RU",
  USD: "en-US",
  EUR: "en-US"
};

// Символ валюты для плейсхолдеров/подписей, где Intl-форматирование суммы не
// применяется (иначе на экране торчит код «RUB» вместо ₽ — UX-находка #13).
const currencySymbols: Record<SystemCurrency, string> = {
  RUB: "₽",
  USD: "$",
  EUR: "€"
};

export const currencySymbol = (currency: unknown): string =>
  currencySymbols[resolvePreferredCurrency(currency)];

const normalizeMoneyInput = (value: unknown): string => (
  String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".")
);

const hasMinorFraction = (amountMinor: number) => Math.abs(amountMinor) % 100 !== 0;

export const resolvePreferredCurrency = (value: unknown): SystemCurrency => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return systemCurrencies.includes(normalized as SystemCurrency)
    ? normalized as SystemCurrency
    : defaultPreferredCurrency;
};

export const parseMoneyInputToMinor = (value: unknown): number | null => {
  const normalized = normalizeMoneyInput(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100);
};

export const formatMoneyInputValueFromMinor = (amountMinor: number | null | undefined): string => {
  if (amountMinor == null || !Number.isFinite(amountMinor)) {
    return "";
  }

  const major = amountMinor / 100;
  return Number.isInteger(major)
    ? String(major)
    : major.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

export const convertRubMinorToCurrencyMinor = (
  amountMinorRub: number,
  currency: SystemCurrency,
  rates: SystemCurrencyRateMap
) => (
  currency === "RUB"
    ? amountMinorRub
    : Math.round((amountMinorRub * 100) / rates[currency])
);

export const convertCurrencyMinor = (
  amountMinor: number,
  fromCurrency: SystemCurrency,
  toCurrency: SystemCurrency,
  rates: SystemCurrencyRateMap
) => {
  if (fromCurrency === toCurrency) {
    return amountMinor;
  }

  const rubMinor = fromCurrency === "RUB"
    ? amountMinor
    : convertCurrencyMinorToRubMinor(amountMinor, fromCurrency, rates);

  return convertRubMinorToCurrencyMinor(rubMinor, toCurrency, rates);
};

export const formatCurrencyMinor = (
  amountMinor: number,
  currency: SystemCurrency
) => new Intl.NumberFormat(currencyLocales[currency], {
  style: "currency",
  currency,
  minimumFractionDigits: hasMinorFraction(amountMinor) ? 2 : 0,
  maximumFractionDigits: 2
}).format(amountMinor / 100);

export const formatUnitPriceMinor = (
  amountMinor: number,
  currency: SystemCurrency,
  unitLabel: string
) => `${formatCurrencyMinor(amountMinor, currency)} / ${unitLabel}`;
