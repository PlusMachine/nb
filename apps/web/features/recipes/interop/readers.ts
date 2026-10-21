import { inventoryUnits, type InventoryUnit } from "../../inventory/units";

export const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === "object" && !Array.isArray(value)
);

export const readNumber = (value: unknown): number | null => {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
export const readString = (value: unknown): string | null => (
  typeof value === "string" && value.trim() ? value.trim() : null
);
export const readFirstNumber = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) { const value = readNumber(record[key]); if (value != null) return value; }
  return null;
};
export const readFirstString = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) { const value = readString(record[key]); if (value != null) return value; }
  return null;
};

const unitAliases: Record<string, InventoryUnit> = {
  grams: "g", gram: "g", kilograms: "kg", kilogram: "kg",
  liters: "l", litres: "l", liter: "l", litre: "l",
  milliliters: "ml", millilitres: "ml", milliliter: "ml", millilitre: "ml",
  ounces: "oz", ounce: "oz", pounds: "lb", pound: "lb", lbs: "lb",
  gallons: "gal", gallon: "gal", packages: "pack", package: "pack", packs: "pack",
  packets: "pack", packet: "pack", pkg: "pack", units: "item", items: "item", unit: "item", pcs: "item", each: "item",
};
export const readUnit = (value: unknown, fallback: InventoryUnit): InventoryUnit => {
  const unit = readString(value)?.toLowerCase();
  if (!unit) return fallback;
  const resolved = unitAliases[unit] ?? ((inventoryUnits as readonly string[]).includes(unit) ? unit as InventoryUnit : null);
  if (!resolved) throw new Error(`UNSUPPORTED_IMPORT_UNIT: ${unit}`);
  return resolved;
};

export const importWarnings = (meta: unknown): string[] => (
  isRecord(meta) && Array.isArray(meta.warnings)
    ? meta.warnings.filter((value): value is string => typeof value === "string") : []
);
