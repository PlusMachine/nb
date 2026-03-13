import { describe, expect, it } from "vitest";

import {
  convertCurrencyMinor,
  convertRubMinorToCurrencyMinor,
  defaultPreferredCurrency,
  formatCurrencyMinor,
  formatUnitPriceMinor,
  resolvePreferredCurrency
} from "../features/system/money";
import { defaultSystemCurrencyRates } from "../features/system/currency-rates";

describe("money display helpers", () => {
  it("defaults preferred currency to RUB", () => {
    expect(defaultPreferredCurrency).toBe("RUB");
    expect(resolvePreferredCurrency(undefined)).toBe("RUB");
    expect(resolvePreferredCurrency("usd")).toBe("USD");
  });

  it("converts rub base amounts into configured display currencies", () => {
    expect(convertRubMinorToCurrencyMinor(125000, "USD", defaultSystemCurrencyRates)).toBe(1582);
    expect(convertRubMinorToCurrencyMinor(125000, "EUR", defaultSystemCurrencyRates)).toBe(1363);
    expect(convertCurrencyMinor(1000, "USD", "EUR", defaultSystemCurrencyRates)).toBe(862);
  });

  it("formats money and unit prices for display", () => {
    expect(formatCurrencyMinor(125000, "RUB")).toContain("₽");
    expect(formatCurrencyMinor(1582, "USD")).toContain("$");
    expect(formatUnitPriceMinor(25000, "RUB", "kg")).toContain("/ kg");
  });
});
