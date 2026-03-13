export const systemCurrencies = ["RUB", "USD", "EUR"] as const;
export type SystemCurrency = (typeof systemCurrencies)[number];

export type SystemCurrencyRateMap = Record<SystemCurrency, number>;

export const defaultSystemCurrencyRates: SystemCurrencyRateMap = {
  RUB: 100,
  USD: 7900,
  EUR: 9170
};

export const mergeSystemCurrencyRates = (
  rows: Array<{ currency: string; rubMinorPerUnit: number | null | undefined }>
): SystemCurrencyRateMap => {
  const merged = { ...defaultSystemCurrencyRates };

  for (const row of rows) {
    if (!systemCurrencies.includes(row.currency as SystemCurrency)) {
      continue;
    }

    if (row.rubMinorPerUnit == null || row.rubMinorPerUnit <= 0) {
      continue;
    }

    merged[row.currency as SystemCurrency] = row.rubMinorPerUnit;
  }

  return merged;
};

export const convertCurrencyMinorToRubMinor = (
  amountMinor: number,
  currency: SystemCurrency,
  rates: SystemCurrencyRateMap
) => Math.round((amountMinor * rates[currency]) / 100);
