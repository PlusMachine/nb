import "server-only";

import { asc, db, systemCurrencyRates } from "@nb/db";

import {
  defaultSystemCurrencyRates,
  mergeSystemCurrencyRates,
  systemCurrencies,
  type SystemCurrencyRateMap
} from "./currency";

export const listSystemCurrencyRates = async (): Promise<SystemCurrencyRateMap> => {
  const rows = await db
    .select({
      currency: systemCurrencyRates.currency,
      rubMinorPerUnit: systemCurrencyRates.rubMinorPerUnit
    })
    .from(systemCurrencyRates)
    .orderBy(asc(systemCurrencyRates.currency));

  return mergeSystemCurrencyRates(rows);
};

export const upsertSystemCurrencyRates = async (rates: Partial<SystemCurrencyRateMap>): Promise<SystemCurrencyRateMap> => {
  const now = new Date();
  const nextRates = {
    ...defaultSystemCurrencyRates,
    ...rates
  };

  for (const currency of systemCurrencies) {
    await db.insert(systemCurrencyRates).values({
      currency,
      rubMinorPerUnit: nextRates[currency],
      createdAt: now,
      updatedAt: now
    }).onConflictDoUpdate({
      target: systemCurrencyRates.currency,
      set: {
        rubMinorPerUnit: nextRates[currency],
        updatedAt: now
      }
    });
  }

  return nextRates;
};
export {
  convertCurrencyMinorToRubMinor,
  defaultSystemCurrencyRates,
  mergeSystemCurrencyRates,
  systemCurrencies
} from "./currency";
export type { SystemCurrency, SystemCurrencyRateMap } from "./currency";
