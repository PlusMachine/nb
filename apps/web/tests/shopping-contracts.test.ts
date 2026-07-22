import { describe, expect, it } from "vitest";

import {
  addManualShoppingItemSchema,
  toggleShoppingLineCheckedSchema,
  transferCheckedToStockSchema,
  updateManualShoppingItemSchema
} from "../features/shopping/contracts";

// Юнит-тесты схем П1 (ручные позиции «Своё») / П2 (отметка «куплено» +
// перенос на склад) — без БД и сервисного слоя, чистая проверка контракта
// (та же граница, что и tests/inventory-contracts.test.ts для inventory/*).

describe("shopping/contracts — П1: addManualShoppingItemSchema", () => {
  it("имя триммится и ограничено 180 символами", () => {
    const parsed = addManualShoppingItemSchema.parse({ name: "  Дезинфектант Star San  " });
    expect(parsed.name).toBe("Дезинфектант Star San");

    expect(() => addManualShoppingItemSchema.parse({ name: "а".repeat(181) })).toThrow();
    expect(() => addManualShoppingItemSchema.parse({ name: "а".repeat(180) })).not.toThrow();
    expect(() => addManualShoppingItemSchema.parse({ name: "" })).toThrow();
    expect(() => addManualShoppingItemSchema.parse({ name: "   " })).toThrow();
  });

  it("quantity/unit — пара «вместе или никак»", () => {
    expect(() => addManualShoppingItemSchema.parse({ name: "Хмель про запас", quantity: 5 })).toThrow();
    expect(() => addManualShoppingItemSchema.parse({ name: "Хмель про запас", unit: "g" })).toThrow();
    expect(() => addManualShoppingItemSchema.parse({ name: "Хмель про запас" })).not.toThrow();
    expect(() => addManualShoppingItemSchema.parse({ name: "Хмель про запас", quantity: 5, unit: "g" })).not.toThrow();
  });

  it("unit обязан входить в inventoryUnits", () => {
    expect(() => addManualShoppingItemSchema.parse({ name: "X", quantity: 5, unit: "коробка" })).toThrow();
    expect(() => addManualShoppingItemSchema.parse({ name: "X", quantity: 5, unit: "g" })).not.toThrow();
  });

  it("quantity должно быть положительным конечным числом", () => {
    expect(() => addManualShoppingItemSchema.parse({ name: "X", quantity: 0, unit: "g" })).toThrow();
    expect(() => addManualShoppingItemSchema.parse({ name: "X", quantity: -1, unit: "g" })).toThrow();
    expect(() => addManualShoppingItemSchema.parse({ name: "X", quantity: 1, unit: "g" })).not.toThrow();
  });

  it("catalogId и customId — взаимоисключающие (нельзя привязать сразу к обоим)", () => {
    expect(() => addManualShoppingItemSchema.parse({
      name: "X",
      catalogId: "cat-1",
      customId: "11111111-1111-1111-1111-111111111111"
    })).toThrow();

    expect(() => addManualShoppingItemSchema.parse({ name: "X", catalogId: "cat-1" })).not.toThrow();
    expect(() => addManualShoppingItemSchema.parse({
      name: "X",
      customId: "11111111-1111-1111-1111-111111111111"
    })).not.toThrow();
  });

  it("customId обязан быть валидным uuid", () => {
    expect(() => addManualShoppingItemSchema.parse({ name: "X", customId: "not-a-uuid" })).toThrow();
  });

  it("catalogId ограничен 120 символами (text-id каталога с запасом)", () => {
    expect(() => addManualShoppingItemSchema.parse({ name: "X", catalogId: "c".repeat(121) })).toThrow();
    expect(() => addManualShoppingItemSchema.parse({ name: "X", catalogId: "c".repeat(120) })).not.toThrow();
  });
});

describe("shopping/contracts — updateManualShoppingItemSchema", () => {
  it("та же пара quantity/unit «вместе или никак», без catalogId/customId в схеме", () => {
    expect(() => updateManualShoppingItemSchema.parse({ name: "X", quantity: 5 })).toThrow();
    expect(() => updateManualShoppingItemSchema.parse({ name: "X", unit: "g" })).toThrow();
    expect(() => updateManualShoppingItemSchema.parse({ name: "X", quantity: 5, unit: "g" })).not.toThrow();
    expect(() => updateManualShoppingItemSchema.parse({ name: "X" })).not.toThrow();
  });
});

describe("shopping/contracts — П2: toggleShoppingLineCheckedSchema", () => {
  it("lineKey — непустая строка не длиннее 512 символов", () => {
    expect(() => toggleShoppingLineCheckedSchema.parse({ lineKey: "", checked: true })).toThrow();
    expect(() => toggleShoppingLineCheckedSchema.parse({ lineKey: "x".repeat(513), checked: true })).toThrow();
    expect(() => toggleShoppingLineCheckedSchema.parse({ lineKey: "x".repeat(512), checked: true })).not.toThrow();
    expect(() => toggleShoppingLineCheckedSchema.parse({ lineKey: "catalog:cat-1|g", checked: false })).not.toThrow();
  });

  it("checked обязан быть boolean", () => {
    expect(() => toggleShoppingLineCheckedSchema.parse({ lineKey: "catalog:cat-1|g", checked: "true" })).toThrow();
  });
});

describe("shopping/contracts — П2: transferCheckedToStockSchema", () => {
  const derivedLine = (i: number) => ({
    kind: "derived" as const,
    lineKey: `catalog:cat-${i}|g`,
    quantity: 1,
    unit: "g" as const
  });

  it("не меньше 1 и не больше 200 строк за один перенос", () => {
    expect(() => transferCheckedToStockSchema.parse({ lines: [] })).toThrow();

    const exactly200 = Array.from({ length: 200 }, (_, i) => derivedLine(i));
    expect(() => transferCheckedToStockSchema.parse({ lines: exactly200 })).not.toThrow();

    const tooMany = Array.from({ length: 201 }, (_, i) => derivedLine(i));
    expect(() => transferCheckedToStockSchema.parse({ lines: tooMany })).toThrow();
  });

  it("lineKey строки — не длиннее 512 символов (та же граница, что и у toggle)", () => {
    expect(() => transferCheckedToStockSchema.parse({
      lines: [{ kind: "derived", lineKey: "x".repeat(513), quantity: 1, unit: "g" }]
    })).toThrow();
  });

  it("derived-строка требует lineKey, manual-строка требует id — discriminated union по kind", () => {
    expect(() => transferCheckedToStockSchema.parse({
      lines: [{ kind: "derived", quantity: 1, unit: "g" }]
    })).toThrow();

    expect(() => transferCheckedToStockSchema.parse({
      lines: [{ kind: "manual", quantity: 1, unit: "g" }]
    })).toThrow();

    expect(() => transferCheckedToStockSchema.parse({
      lines: [{ kind: "manual", id: "11111111-1111-1111-1111-111111111111", quantity: 1, unit: "g" }]
    })).not.toThrow();
  });

  it("quantity — положительное конечное число, unit — валидная единица", () => {
    expect(() => transferCheckedToStockSchema.parse({
      lines: [{ kind: "derived", lineKey: "catalog:cat-1|g", quantity: 0, unit: "g" }]
    })).toThrow();

    expect(() => transferCheckedToStockSchema.parse({
      lines: [{ kind: "derived", lineKey: "catalog:cat-1|g", quantity: 1, unit: "коробка" }]
    })).toThrow();
  });
});
