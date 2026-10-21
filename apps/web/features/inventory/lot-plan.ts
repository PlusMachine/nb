import { roundTo } from "@nb/brewing-core";

export type InventoryLotBalance = { inventoryItemId: string; availableQuantity: number };

/** Общий бюджет лотов для всех внесений; одинаковый расчёт в превью и аллокации. */
export const planInventoryLotUse = (required: number, lots: InventoryLotBalance[], remaining: Map<string, number>) => {
  let shortfall = required;
  const takes: Array<{ inventoryItemId: string; quantity: number }> = [];
  for (const lot of lots) {
    const available = Math.max(0, remaining.get(lot.inventoryItemId) ?? lot.availableQuantity);
    const quantity = roundTo(Math.min(Math.max(0, shortfall), available), 3);
    if (quantity > 0) takes.push({ inventoryItemId: lot.inventoryItemId, quantity });
    remaining.set(lot.inventoryItemId, Math.max(0, roundTo(available - quantity, 3)));
    shortfall = Math.max(0, roundTo(shortfall - quantity, 3));
  }
  return { takes, shortfall };
};
