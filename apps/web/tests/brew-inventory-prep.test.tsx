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
  batchAlreadyConsumed: false,
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

// A4: блок «Склад» вернулся в акт «Итог» (раньше в done-ветке страницы его просто
// не было, и после завершения варки списанное и история движений пропадали).
// Сам компонент уже был completed-aware — проверяем, что он показывает архивную
// картину, а не предлагает списать ещё раз.
describe("BrewInventory — завершённая партия (акт «Итог»)", () => {
  const consumedView: BrewBatchInventoryView = {
    brewBatchId: "bb-1",
    recipeId: "r-1",
    hasConsumed: true,
    canRestore: true,
    batchAlreadyConsumed: true,
    consumed: [
      {
        inventoryItemId: "ii-1",
        ingredientDisplayName: "Пильзнер",
        quantityNormalized: 4000,
        normalizedUnit: "g",
        requiredQuantityNormalized: null
      }
    ],
    log: [
      {
        id: "log-1",
        inventoryItemId: "ii-1",
        ingredientDisplayName: "Пильзнер",
        type: "consume",
        quantityDeltaNormalized: -4000,
        normalizedUnit: "g",
        createdAt: new Date("2026-07-01T10:00:00Z")
      }
    ]
  };

  it("показывает списанное и историю движений, но не предлагает списать снова", () => {
    const html = renderToStaticMarkup(
      <BrewInventory brewBatchId="bb-1" view={consumedView} status="completed" />
    );

    expect(html).toContain("Склад");
    expect(html).toContain("Списано");
    expect(html).toContain("Пильзнер");
    expect(html).toContain("История движений");
    expect(html).not.toContain("Списать со склада");
  });

  it("оставляет возврат на склад доступным (паритет с device-путём)", () => {
    const html = renderToStaticMarkup(
      <BrewInventory brewBatchId="bb-1" view={consumedView} status="completed" />
    );

    expect(html).toContain("Вернуть на склад");
  });
});

// Дефект A7: флаг списания — про ЭТУ партию, не про рецепт. Вторая варка того же
// рецепта (пока первая ещё активна) обязана видеть кнопку «Списать со склада» и
// честный текст, а не «уже списаны».
describe("BrewInventory — правда про списание этой партии (A7)", () => {
  const freshBatchView: BrewBatchInventoryView = {
    brewBatchId: "bb-2",
    recipeId: "r-1",
    hasConsumed: false,
    canRestore: false,
    // По ЭТОЙ партии не списывалось — хотя по рецепту (другой партией) списание было.
    batchAlreadyConsumed: false,
    consumed: [],
    log: []
  };

  it("вторая партия того же рецепта: кнопка списания доступна, текста «уже списаны» нет", () => {
    const html = renderToStaticMarkup(
      <BrewInventory brewBatchId="bb-2" view={freshBatchView} status="planned" />
    );

    expect(html).toContain("Списать со склада");
    expect(html).not.toContain("уже списаны");
    // Текст обещает ровно то, что делает движок: состав рецепта в объёме ЭТОЙ варки.
    // Прежняя формулировка «по точному совпадению ингредиента и единицы» врала —
    // единицы конвертируются (пачка дрожжей → граммы склада).
    expect(html).toContain("Спишем со склада ингредиенты рецепта — в объёме этой варки");
    expect(html).not.toContain("точному совпадению");
  });

  it("своё списание уже сделано: кнопки списания нет, есть возврат", () => {
    const html = renderToStaticMarkup(
      <BrewInventory
        brewBatchId="bb-2"
        view={{
          ...freshBatchView,
          hasConsumed: true,
          canRestore: true,
          batchAlreadyConsumed: true,
          consumed: [{
            inventoryItemId: "ii-1",
            ingredientDisplayName: "Cascade",
            quantityNormalized: 50,
            normalizedUnit: "g",
            requiredQuantityNormalized: null
          }]
        }}
        status="brewing"
      />
    );

    expect(html).not.toContain("Списать со склада");
    expect(html).toContain("Вернуть на склад");
    expect(html).toContain("Cascade");
  });

  it("рецепт-источник удалён: списывать нечем — кнопки нет, текст честный", () => {
    const html = renderToStaticMarkup(
      <BrewInventory brewBatchId="bb-2" view={{ ...freshBatchView, recipeId: null }} status="planned" />
    );

    expect(html).not.toContain("Списать со склада");
    expect(html).toContain("Рецепт этой варки удалён");
  });
});

// H2: дрожжей на складе меньше, чем требует рецепт → списание ужимается до остатка.
// Это не ошибка (варку не роняем), но и не «всё по рецепту»: строка обязана показать
// оба числа, иначе «Списано» врёт молчанием.
describe("BrewInventory — списали меньше, чем нужно (кламп дрожжей)", () => {
  const clampedView: BrewBatchInventoryView = {
    brewBatchId: "bb-3",
    recipeId: "r-1",
    hasConsumed: true,
    canRestore: true,
    batchAlreadyConsumed: true,
    consumed: [
      {
        inventoryItemId: "ii-yeast",
        ingredientDisplayName: "US-05",
        quantityNormalized: 11,
        normalizedUnit: "g",
        requiredQuantityNormalized: 22
      },
      {
        inventoryItemId: "ii-malt",
        ingredientDisplayName: "Пильзнер",
        quantityNormalized: 4000,
        normalizedUnit: "g",
        requiredQuantityNormalized: null
      }
    ],
    log: []
  };

  it("строка недосписанной позиции показывает «списано из нужного»", () => {
    const html = renderToStaticMarkup(
      <BrewInventory brewBatchId="bb-3" view={clampedView} status="brewing" />
    );

    expect(html).toContain("US-05");
    expect(html).toMatch(/−11 г[\s\S]{0,40}из[\s\S]{0,40}22 г/);
  });

  it("позиция, списанная полностью, второго числа не показывает", () => {
    const html = renderToStaticMarkup(
      <BrewInventory brewBatchId="bb-3" view={clampedView} status="brewing" />
    );

    expect(html).toContain("−4 кг");
    expect(html).not.toMatch(/−4 кг[\s\S]{0,40}из/);
  });
});
