import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Экшены списания/возврата не участвуют в этом тесте — мокаем, чтобы импорт
// клиентского компонента не тянул за собой server actions (db-слой).
vi.mock("@/app/(app)/app/brew-batches/[id]/actions", () => ({
  consumeBrewBatchInventoryAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  restoreBrewBatchInventoryAction: vi.fn(async () => ({ ok: true, message: "ok" }))
}));

import { BrewInventory } from "../features/brew-batches/components/brew-inventory";
import type { BrewBatchInventoryView } from "../features/brew-batches/contracts";

// Пустой склад партии — без списаний/журнала, чтобы в разметке была видна
// только строка нехваток (или её отсутствие).
const emptyView: BrewBatchInventoryView = {
  brewBatchId: "bb-1",
  recipeId: "r-1",
  hasConsumed: false,
  canRestore: false,
  recipeAlreadyConsumed: false,
  consumed: [],
  log: []
};

describe("BrewInventory — вход в «Чего не хватает» из акта «Подготовка» (S3/S4)", () => {
  it("показывает нехватку как ссылку целиком на «Чего не хватает», когда позиций не хватает", () => {
    const html = renderToStaticMarkup(
      <BrewInventory brewBatchId="bb-1" view={emptyView} status="planned" prepShortage={{ missingCount: 5 }} />
    );

    expect(html).toContain("Не хватает 5 позиций");
    expect(html).toContain('href="/app/shopping"');
    // D19: ссылкой становится ВЕСЬ текст «Не хватает N позиций» — отдельного
    // хвоста-лейбла «Список покупок» больше нет.
    expect(html).not.toContain("Список покупок");
    expect(html).toMatch(/<a[^>]*href="\/app\/shopping"[^>]*>[^<]*Не хватает 5 позиций/);
  });

  // Склонение "позиция/позиции/позиций" — то же правило (mod10/mod100), что в
  // components/shopping/shopping-list-view.tsx: 1 → ед.ч., 2-4 → "позиции",
  // 5+ (и 11-14) → "позиций".
  it("склоняет «позиция» для 1 и «позиции» для 2-4", () => {
    const oneHtml = renderToStaticMarkup(
      <BrewInventory brewBatchId="bb-1" view={emptyView} status="planned" prepShortage={{ missingCount: 1 }} />
    );
    expect(oneHtml).toContain("Не хватает 1 позиция");

    const threeHtml = renderToStaticMarkup(
      <BrewInventory brewBatchId="bb-1" view={emptyView} status="planned" prepShortage={{ missingCount: 3 }} />
    );
    expect(threeHtml).toContain("Не хватает 3 позиции");
  });

  it("показывает зелёную строку без ссылки, когда нехваток нет", () => {
    const html = renderToStaticMarkup(
      <BrewInventory brewBatchId="bb-1" view={emptyView} status="planned" prepShortage={{ missingCount: 0 }} />
    );

    expect(html).toContain("Ингредиенты на складе есть");
    expect(html).not.toContain('href="/app/shopping"');
    expect(html).not.toContain("Не хватает");
  });

  it("не рендерит ни одну из строк, если проп не передан", () => {
    const html = renderToStaticMarkup(<BrewInventory brewBatchId="bb-1" view={emptyView} status="planned" />);

    expect(html).not.toContain("Ингредиенты на складе есть");
    expect(html).not.toContain("Не хватает");
    expect(html).not.toContain('href="/app/shopping"');
  });

  it("не рендерит строки и при явном null (акты вне «Подготовки»)", () => {
    const html = renderToStaticMarkup(
      <BrewInventory brewBatchId="bb-1" view={emptyView} status="brewing" prepShortage={null} />
    );

    expect(html).not.toContain("Ингредиенты на складе есть");
    expect(html).not.toContain("Не хватает");
    expect(html).not.toContain('href="/app/shopping"');
  });
});
