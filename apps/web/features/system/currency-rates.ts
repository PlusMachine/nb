import "server-only";

import { asc, db, systemCurrencyRates } from "@nb/db";

import {
  defaultSystemCurrencyRates,
  mergeSystemCurrencyRates,
  systemCurrencies,
  type SystemCurrencyRateMap
} from "./currency";

// db или открытая транзакция — тот же паттерн, что и в features/shopping/data.ts
// (ShoppingDbClient) / features/inventory/service.ts (InventoryDbClient).
// ⚠ Внутри db.transaction(...) нельзя ходить в глобальный пул db мимо клиента
// транзакции: транзакция уже держит одно соединение пула, а этот вызов просит
// у пула ВТОРОЕ — если пул исчерпан конкурентными транзакциями, каждая из них
// ждёт свободное соединение, которое никогда не освободится (все заняты такими
// же ждущими транзакциями) — самодедлок пула.
type CurrencyRatesDbClient = Parameters<Parameters<typeof db.transaction>[0]>[0];
type CurrencyRatesClient = typeof db | CurrencyRatesDbClient;

export const listSystemCurrencyRates = async (client: CurrencyRatesClient = db): Promise<SystemCurrencyRateMap> => {
  const rows = await client
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
