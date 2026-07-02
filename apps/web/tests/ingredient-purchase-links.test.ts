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
  saveIngredientPurchaseLinkRow
} from "../components/ingredients/ingredient-purchase-links-field";
import {
  IngredientPurchaseLinksEditor,
  resolveIngredientPurchaseLinkInitialEditingId,
  shouldCloseIngredientPurchaseLinksOnCancel
} from "../components/ingredients/ingredient-purchase-links-manager";
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

  it("commits added and edited rows explicitly and keeps remove predictable", () => {
    expect(createIngredientPurchaseLinkRows()).toEqual([]);
    expect(createIngredientPurchaseLinkRows(["https://ozon.ru/product/citra"])).toEqual([
      "https://ozon.ru/product/citra"
    ]);

    const afterFirstLink = saveIngredientPurchaseLinkRow([], {
      mode: "new",
      value: "ozon.ru/product/citra"
    });
    expect(afterFirstLink).toEqual(["https://ozon.ru/product/citra"]);

    const afterSecondLink = saveIngredientPurchaseLinkRow(afterFirstLink, {
      mode: "new",
      value: "rdshop.ru/catalog/citra"
    });
    expect(afterSecondLink).toEqual([
      "https://ozon.ru/product/citra",
      "https://rdshop.ru/catalog/citra"
    ]);

    const afterEdit = saveIngredientPurchaseLinkRow(afterSecondLink, {
      mode: "edit",
      index: 0,
      value: "kolba.ru/catalog/citra"
    });
    expect(afterEdit).toEqual([
      "https://kolba.ru/catalog/citra",
      "https://rdshop.ru/catalog/citra"
    ]);

    expect(removeIngredientPurchaseLinkRow(afterEdit, 0)).toEqual([
      "https://rdshop.ru/catalog/citra"
    ]);

    expect(removeIngredientPurchaseLinkRow(["https://rdshop.ru/catalog/citra"], 0)).toEqual([]);
  });

  it("renders purchase links inside an editable sheet surface instead of raw URLs", () => {
    // IngredientPurchaseLinksDialog оборачивает этот контент в @nb/ui Dialog
    // (Radix Portal — рендерится только на клиенте после mount), поэтому сам
    // список ссылок проверяем через IngredientPurchaseLinksEditor напрямую.
    const html = renderToStaticMarkup(React.createElement(IngredientPurchaseLinksEditor, {
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

  it("resolves auto-create mode only for empty link collections", () => {
    expect(resolveIngredientPurchaseLinkInitialEditingId({
      autoStartCreateWhenEmpty: true,
      linksCount: 0
    })).toBe("new");
    expect(resolveIngredientPurchaseLinkInitialEditingId({
      autoStartCreateWhenEmpty: true,
      linksCount: 2
    })).toBeNull();
    expect(resolveIngredientPurchaseLinkInitialEditingId({
      autoStartCreateWhenEmpty: false,
      linksCount: 0
    })).toBeNull();
  });

  it("closes the modal on cancel only for the very first link draft", () => {
    expect(shouldCloseIngredientPurchaseLinksOnCancel({
      editingId: "new",
      linksCount: 0
    })).toBe(true);
    expect(shouldCloseIngredientPurchaseLinksOnCancel({
      editingId: "new",
      linksCount: 2
    })).toBe(false);
    expect(shouldCloseIngredientPurchaseLinksOnCancel({
      editingId: "link-1",
      linksCount: 1
    })).toBe(false);
  });

  it("opens straight into link input when empty-state auto-create is enabled", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientPurchaseLinksEditor, {
      reference: {
        source: "catalog",
        id: "cat-hop-empty"
      },
      initialLinks: [],
      autoStartCreateWhenEmpty: true
    }));

    expect(html).toContain('placeholder="https://..."');
    expect(html).toContain('aria-label="Ссылка"');
    expect(html).toContain(">Добавить<");
    expect(html).not.toContain(">Добавить ссылку<");
    expect(html).not.toContain("Ссылок на покупку пока нет");
    expect(html).not.toContain("Покупка");
    expect(html).not.toContain("Ссылка на покупку");
  });
});
