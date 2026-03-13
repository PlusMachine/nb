import { describe, expect, it } from "vitest";

import {
  convertCurrencyMinorToRubMinor,
  defaultSystemCurrencyRates,
  mergeSystemCurrencyRates
} from "../features/system/currency-rates";

describe("currency rates foundation", () => {
  it("uses safe defaults for rub/usd/eur", () => {
    expect(defaultSystemCurrencyRates).toEqual({
      RUB: 100,
      USD: 7900,
      EUR: 9170
    });
  });

  it("merges configured rates over defaults", () => {
    const rates = mergeSystemCurrencyRates([
      { currency: "USD", rubMinorPerUnit: 8100 },
      { currency: "EUR", rubMinorPerUnit: 9300 }
    ]);

    expect(rates).toEqual({
      RUB: 100,
      USD: 8100,
      EUR: 9300
    });
  });

  it("converts purchase minor units into rub minor base", () => {
    expect(convertCurrencyMinorToRubMinor(125000, "RUB", defaultSystemCurrencyRates)).toBe(125000);
    expect(convertCurrencyMinorToRubMinor(1000, "USD", defaultSystemCurrencyRates)).toBe(79000);
    expect(convertCurrencyMinorToRubMinor(1000, "EUR", defaultSystemCurrencyRates)).toBe(91700);
  });
});
