import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/app/ingredients/metadata-actions", () => ({
  listIngredientPurchaseLinksAction: vi.fn(async () => []),
  createIngredientPurchaseLinkAction: vi.fn(async () => ({ ok: true })),
  updateIngredientPurchaseLinkAction: vi.fn(async () => ({ ok: true })),
  deleteIngredientPurchaseLinkAction: vi.fn(async () => ({ ok: true }))
}));

import {
  createIngredientPurchaseLinkRows,
  removeIngredientPurchaseLinkRow,
  updateIngredientPurchaseLinkRows
} from "../components/ingredients/ingredient-purchase-links-field";
import { IngredientPurchaseLinksDialog } from "../components/ingredients/ingredient-purchase-links-manager";
import {
  buildIngredientPurchaseLinkView,
  detectIngredientPurchaseMarketplaceByHost,
  normalizeIngredientPurchaseLinkInputs
} from "../features/ingredients/purchase-links";

describe("ingredient purchase links", () => {
  it("auto-detects supported marketplaces from link domains", () => {
    expect(detectIngredientPurchaseMarketplaceByHost("ozon.ru")).toBe("ozon");
    expect(detectIngredientPurchaseMarketplaceByHost("www.wildberries.ru")).toBe("wildberries");
    expect(detectIngredientPurchaseMarketplaceByHost("wb.ru")).toBe("wildberries");
    expect(detectIngredientPurchaseMarketplaceByHost("avito.ru")).toBe("avito");
    expect(detectIngredientPurchaseMarketplaceByHost("market.yandex.ru")).toBe("yandex_market");
    expect(detectIngredientPurchaseMarketplaceByHost("rdshop.ru")).toBe("russkaya_dymka");
    expect(detectIngredientPurchaseMarketplaceByHost("kolba.ru")).toBe("kolba");
    expect(detectIngredientPurchaseMarketplaceByHost("xn--90aoy.xn--p1ai")).toBe("birrf");
    expect(detectIngredientPurchaseMarketplaceByHost("example.com")).toBe("other");
  });

  it("normalizes purchase-link inputs and deduplicates repeated URLs", () => {
    expect(normalizeIngredientPurchaseLinkInputs([
      "ozon.ru/product/citra",
      "https://ozon.ru/product/citra/",
      "market.yandex.ru/product--citra"
    ])).toEqual([
      "https://ozon.ru/product/citra",
      "https://market.yandex.ru/product--citra"
    ]);
  });

  it("adds trailing draft rows only after a valid URL and keeps inline edit/remove predictable", () => {
    expect(createIngredientPurchaseLinkRows()).toEqual([""]);
    expect(createIngredientPurchaseLinkRows(["https://ozon.ru/product/citra"])).toEqual([
      "https://ozon.ru/product/citra",
      ""
    ]);

    const afterFirstLink = updateIngredientPurchaseLinkRows([""], 0, "ozon.ru/product/citra");
    expect(afterFirstLink).toEqual([
      "ozon.ru/product/citra",
      ""
    ]);

    const afterSecondLink = updateIngredientPurchaseLinkRows(afterFirstLink, 1, "rdshop.ru/catalog/citra");
    expect(afterSecondLink).toEqual([
      "ozon.ru/product/citra",
      "rdshop.ru/catalog/citra",
      ""
    ]);

    const afterEdit = updateIngredientPurchaseLinkRows(afterSecondLink, 0, "kolba.ru/catalog/citra");
    expect(afterEdit).toEqual([
      "kolba.ru/catalog/citra",
      "rdshop.ru/catalog/citra",
      ""
    ]);

    expect(removeIngredientPurchaseLinkRow(afterEdit, 0)).toEqual([
      "rdshop.ru/catalog/citra",
      ""
    ]);
  });

  it("renders purchase links inside an editable sheet surface instead of raw URLs", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientPurchaseLinksDialog, {
      open: true,
      onClose: () => undefined,
      reference: {
        source: "catalog",
        id: "cat-hop-1"
      },
      initialLinks: [
        buildIngredientPurchaseLinkView({
          id: "link-1",
          url: "https://ozon.ru/product/citra",
          normalizedUrl: "https://ozon.ru/product/citra",
          position: 0
        }),
        buildIngredientPurchaseLinkView({
          id: "link-2",
          url: "https://kolba.ru/catalog/citra",
          normalizedUrl: "https://kolba.ru/catalog/citra",
          position: 1
        })
      ]
    }));

    expect(html).toContain('role="dialog"');
    expect(html).toContain("Ссылки на покупку");
    expect(html).toContain("Ozon");
    expect(html).toContain("ozon.ru");
    expect(html).toContain("Колба");
    expect(html).toContain("kolba.ru");
    expect(html).toContain('aria-label="Открыть Ozon"');
    expect(html).toContain('aria-label="Редактировать ссылку"');
    expect(html).toContain('aria-label="Удалить ссылку"');
    expect(html).toContain(">Добавить ссылку<");
    expect(html).not.toContain(">https://ozon.ru/product/citra<");
  });
});
