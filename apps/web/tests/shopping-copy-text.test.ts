import { describe, expect, it } from "vitest";

import { buildShoppingListCopyText } from "../features/shopping/copy-text";
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

describe("buildShoppingListCopyText", () => {
  it("полный формат: заголовок, группы по порядку, «Своё» в конце", () => {
    const text = buildShoppingListCopyText({
      groups: [
        {
          label: "Солод и зерно",
          items: [
            line({
              key: "k1",
              ingredientDisplayName: "Pale Ale (Курский солод)",
              quantityLabel: "4,2 кг"
            })
          ]
        },
        {
          label: "Хмель",
          items: [
            line({
              key: "k2",
              ingredientDisplayName: "Citra",
              quantityLabel: "37 г",
              packSuggestion: { label: "50 г", totalQuantity: 50, totalUnit: "g" }
            })
          ]
        }
      ],
      manualItems: [manualItem({ name: "Дезинфектант Star San" })]
    });

    expect(text).toBe(
      [
        "Список покупок — nb",
        "Солод и зерно:",
        "• Pale Ale (Курский солод) — 4,2 кг",
        "Хмель:",
        "• Citra — 50 г (нужно 37 г)",
        "Своё:",
        "• Дезинфектант Star San"
      ].join("\n")
    );
  });

  it("packSuggestion с фасовочным лейблом («пачка 50 г») даёт ровно «— пачка 50 г (нужно 37 г)»", () => {
    const text = buildShoppingListCopyText({
      groups: [
        {
          label: "Хмель",
          items: [
            line({
              ingredientDisplayName: "Citra",
              quantityLabel: "37 г",
              packSuggestion: { label: "пачка 50 г", totalQuantity: 50, totalUnit: "g" }
            })
          ]
        }
      ],
      manualItems: []
    });

    expect(text).toBe(["Список покупок — nb", "Хмель:", "• Citra — пачка 50 г (нужно 37 г)"].join("\n"));
  });

  it("отмеченные производные и ручные строки пропущены", () => {
    const text = buildShoppingListCopyText({
      groups: [
        {
          label: "Хмель",
          items: [
            line({ ingredientDisplayName: "Citra", checked: false }),
            line({ key: "k-checked", ingredientDisplayName: "Mosaic", checked: true })
          ]
        }
      ],
      manualItems: [
        manualItem({ id: "mi-1", name: "Кроненпробки", checked: false }),
        manualItem({ id: "mi-2", name: "Дезинфектант Star San", checked: true })
      ]
    });

    expect(text).toContain("Citra");
    expect(text).not.toContain("Mosaic");
    expect(text).toContain("Кроненпробки");
    expect(text).not.toContain("Star San");
  });

  it("группа целиком отмечена → заголовок группы не выводится", () => {
    const text = buildShoppingListCopyText({
      groups: [
        {
          label: "Хмель",
          items: [line({ ingredientDisplayName: "Citra", checked: true })]
        },
        {
          label: "Солод и зерно",
          items: [line({ ingredientDisplayName: "Pale Ale", checked: false })]
        }
      ],
      manualItems: []
    });

    expect(text).not.toContain("Хмель");
    expect(text).toContain("Солод и зерно");
    expect(text).toContain("Pale Ale");
  });

  it("ручная позиция без количества — только имя", () => {
    const text = buildShoppingListCopyText({
      groups: [],
      manualItems: [manualItem({ name: "Дезинфектант Star San", quantityLabel: null })]
    });

    expect(text).toBe(["Список покупок — nb", "Своё:", "• Дезинфектант Star San"].join("\n"));
  });

  it("всё отмечено → null", () => {
    const text = buildShoppingListCopyText({
      groups: [
        {
          label: "Хмель",
          items: [line({ ingredientDisplayName: "Citra", checked: true })]
        }
      ],
      manualItems: [manualItem({ checked: true })]
    });

    expect(text).toBeNull();
  });

  it("пустой вход → null", () => {
    expect(buildShoppingListCopyText({ groups: [], manualItems: [] })).toBeNull();
  });

  it("нет ручных позиций → нет секции «Своё:»", () => {
    const text = buildShoppingListCopyText({
      groups: [
        {
          label: "Хмель",
          items: [line({ ingredientDisplayName: "Citra" })]
        }
      ],
      manualItems: []
    });

    expect(text).not.toContain("Своё");
  });
});
