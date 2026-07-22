import { describe, expect, it, vi } from "vitest";

// transfer-dialog.tsx зовёт transferCheckedToStockAction (server action), тот
// тянет features/shopping/service.ts -> ... -> "server-only" (не резолвится
// вне Next/webpack). Мокаем экшены — паттерн tests/shopping-page-view.test.ts —
// чтобы импорт чистой функции deriveRows не тащил реальный граф сервисов.
vi.mock("../features/shopping/actions", () => ({
  transferCheckedToStockAction: vi.fn()
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined })
}));

import { deriveRows } from "../components/shopping/transfer-dialog";
import type { ShoppingListGroupDto, ShoppingManualItemDto } from "../features/shopping/contracts";

const line = (
  overrides: Partial<ShoppingListGroupDto["items"][number]> = {}
): ShoppingListGroupDto["items"][number] => ({
  key: "catalog:cat-x|g",
  ingredientDisplayName: "Citra",
  category: "hop",
  quantityToBuy: 50,
  unit: "g",
  quantityLabel: "50 г",
  catalogHref: null,
  addToStockHref: null,
  neededBy: [],
  checked: false,
  hasStockLinkage: true,
  packSuggestion: null,
  brand: null,
  countryName: null,
  ...overrides
});

const groupOf = (items: ShoppingListGroupDto["items"]): ShoppingListGroupDto[] => [
  { category: "hop", label: "Хмель", items }
];

const manualItem = (overrides: Partial<ShoppingManualItemDto> = {}): ShoppingManualItemDto => ({
  id: "mi-1",
  name: "Дезинфектант Star San",
  quantity: null,
  unit: null,
  quantityLabel: null,
  category: null,
  catalogHref: null,
  addToStockHref: null,
  checked: false,
  hasStockLinkage: false,
  ...overrides
});

describe("deriveRows", () => {
  it("отмеченная производная строка с привязкой -> transferable", () => {
    const { transferable, unresolved } = deriveRows(
      groupOf([line({ checked: true, hasStockLinkage: true })]),
      []
    );

    expect(transferable).toHaveLength(1);
    expect(transferable[0]).toMatchObject({ kind: "derived", name: "Citra" });
    expect(unresolved).toHaveLength(0);
  });

  it("отмеченная производная строка без привязки -> unresolved", () => {
    const { transferable, unresolved } = deriveRows(
      groupOf([line({ checked: true, hasStockLinkage: false })]),
      []
    );

    expect(transferable).toHaveLength(0);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].name).toBe("Citra");
  });

  it("⚠ ручная позиция с привязкой, но без количества/единицы -> unresolved", () => {
    const { transferable, unresolved } = deriveRows(
      [],
      [manualItem({ checked: true, hasStockLinkage: true, quantity: null, unit: null })]
    );

    expect(transferable).toHaveLength(0);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].name).toBe("Дезинфектант Star San");
  });

  it("неотмеченные строки не попадают ни в transferable, ни в unresolved", () => {
    const { transferable, unresolved } = deriveRows(
      groupOf([line({ checked: false, hasStockLinkage: true }), line({ key: "catalog:cat-y|g", checked: false, hasStockLinkage: false })]),
      [manualItem({ checked: false, hasStockLinkage: true, quantity: 1, unit: "g" })]
    );

    expect(transferable).toHaveLength(0);
    expect(unresolved).toHaveLength(0);
  });

  it("prefill: при наличии packSuggestion его totalQuantity приоритетнее quantityToBuy", () => {
    const { transferable } = deriveRows(
      groupOf([
        line({
          checked: true,
          hasStockLinkage: true,
          quantityToBuy: 37,
          packSuggestion: { label: "пачка 50 г", totalQuantity: 50, totalUnit: "g" }
        })
      ]),
      []
    );

    expect(transferable[0].defaultQuantity).toBe(50);
  });

  it("prefill: без packSuggestion предзаполняется расчётной нехваткой (quantityToBuy)", () => {
    const { transferable } = deriveRows(
      groupOf([line({ checked: true, hasStockLinkage: true, quantityToBuy: 37, packSuggestion: null })]),
      []
    );

    expect(transferable[0].defaultQuantity).toBe(37);
  });

  it("prefill: ручная позиция предзаполняется собственным quantity", () => {
    const { transferable } = deriveRows(
      [],
      [manualItem({ checked: true, hasStockLinkage: true, quantity: 12, unit: "g" })]
    );

    expect(transferable[0].defaultQuantity).toBe(12);
  });

  it("ключи стабильны: derived:<lineKey> и manual:<id> — и для transferable, и для unresolved", () => {
    const { transferable: derivedOk } = deriveRows(
      groupOf([line({ key: "catalog:cat-x|g", checked: true, hasStockLinkage: true })]),
      []
    );
    expect(derivedOk[0].key).toBe("derived:catalog:cat-x|g");

    const { unresolved: derivedBad } = deriveRows(
      groupOf([line({ key: "catalog:cat-y|g", checked: true, hasStockLinkage: false })]),
      []
    );
    expect(derivedBad[0].key).toBe("derived:catalog:cat-y|g");

    const { transferable: manualOk } = deriveRows(
      [],
      [manualItem({ id: "mi-9", checked: true, hasStockLinkage: true, quantity: 5, unit: "g" })]
    );
    expect(manualOk[0].key).toBe("manual:mi-9");

    const { unresolved: manualBad } = deriveRows(
      [],
      [manualItem({ id: "mi-10", checked: true, hasStockLinkage: false })]
    );
    expect(manualBad[0].key).toBe("manual:mi-10");
  });
});
