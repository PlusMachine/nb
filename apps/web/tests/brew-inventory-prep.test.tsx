import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Экшены списания/возврата не участвуют в этом тесте — мокаем, чтобы импорт
// клиентского компонента не тянул за собой server actions (db-слой).
vi.mock("@/app/(app)/app/brew-batches/[id]/actions", () => ({
  consumeBrewBatchInventoryAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  restoreBrewBatchInventoryAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  previewBrewBatchInventoryAction: vi.fn(async () => ({ ok: true, message: "", plan: undefined }))
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

// Ф5 (docs/brew-start-flow-redesign.md): кнопка «Списать со склада» знает про
// покрытие склада, посчитанное на странице партии (computeRecipeMatch). Три
// исхода — пустой склад (кнопки нет вовсе, только объяснение и вход в покупки),
// частичное покрытие (кнопка + честная подпись «N из M») и полное (кнопка +
// заметный призыв) — плюс два вырожденных случая: коверидж не посчитан (null) и
// кнопка недоступна независимо от коверижда (canConsume=false).
describe("BrewInventory — Ф5: коверидж склада у кнопки списания", () => {
  it("пустой склад: кнопки «Списать со склада» нет, есть объяснение и ссылка в покупки", () => {
    const html = renderToStaticMarkup(
      <BrewInventory
        brewBatchId="bb-1"
        view={emptyView}
        status="planned"
        stockCoverage={{ totalLines: 5, presentCount: 0, coveredCount: 0, fullyCovered: false }}
      />
    );

    expect(html).not.toContain("Списать со склада");
    expect(html).toContain("Ингредиентов этого рецепта нет на складе");
    expect(html).toContain('href="/app/shopping"');
    expect(html).toContain("Чего не хватает");
  });

  it("частичное покрытие: кнопка остаётся, рядом честная подпись «N из M позиций»", () => {
    const html = renderToStaticMarkup(
      <BrewInventory
        brewBatchId="bb-1"
        view={emptyView}
        status="planned"
        stockCoverage={{ totalLines: 5, presentCount: 3, coveredCount: 3, fullyCovered: false }}
      />
    );

    expect(html).toContain("Списать со склада");
    expect(html).toContain("На складе 3 из 5 позиций");
    expect(html).toContain('href="/app/shopping"');
    // Призыва «списать?» тут быть не должно — покрытие неполное, не дублируем.
    expect(html).not.toContain("Все ингредиенты есть на складе");
  });

  // Находка 1: подпись обязана честно считать ЗАКРЫТЫЕ позиции (coveredCount:
  // covered+substitute), а не presentCount (тот считает и partial — товар есть,
  // но меньше нужного). Иначе «На складе 5 из 5» врёт при неполном покрытии.
  it("presentCount врёт полным покрытием, coveredCount честно показывает нехватку (Находка 1)", () => {
    const html = renderToStaticMarkup(
      <BrewInventory
        brewBatchId="bb-1"
        view={emptyView}
        status="planned"
        stockCoverage={{ totalLines: 5, presentCount: 5, coveredCount: 4, fullyCovered: false }}
      />
    );

    expect(html).toContain("Списать со склада");
    expect(html).toContain("На складе 4 из 5 позиций");
    expect(html).not.toContain("Все ингредиенты есть на складе");
  });

  it("coveredCount === totalLines при !fullyCovered (закрыто целиком заменами): подписи и ссылки в покупки нет", () => {
    const html = renderToStaticMarkup(
      <BrewInventory
        brewBatchId="bb-1"
        view={emptyView}
        status="planned"
        stockCoverage={{ totalLines: 5, presentCount: 5, coveredCount: 5, fullyCovered: false }}
      />
    );

    expect(html).toContain("Списать со склада");
    expect(html).not.toContain("На складе");
    expect(html).not.toContain("Все ингредиенты есть на складе");
    expect(html).not.toContain('href="/app/shopping"');
  });

  it("полное покрытие: заметный призыв «Все ингредиенты есть на складе — списать?»", () => {
    const html = renderToStaticMarkup(
      <BrewInventory
        brewBatchId="bb-1"
        view={emptyView}
        status="planned"
        stockCoverage={{ totalLines: 4, presentCount: 4, coveredCount: 4, fullyCovered: true }}
      />
    );

    expect(html).toContain("Списать со склада");
    expect(html).toContain("Все ингредиенты есть на складе — списать?");
    expect(html).not.toContain("На складе 4 из 4");
  });

  it("stockCoverage=null: ни одна из коверидж-строк не рендерится", () => {
    const html = renderToStaticMarkup(
      <BrewInventory brewBatchId="bb-1" view={emptyView} status="planned" stockCoverage={null} />
    );

    expect(html).not.toContain("Ингредиентов этого рецепта нет на складе");
    expect(html).not.toContain("На складе");
    expect(html).not.toContain("Все ингредиенты есть на складе");
    // Кнопка при этом доступна — коверидж просто не посчитан, а не «нет на складе».
    expect(html).toContain("Списать со склада");
  });

  it("canConsume=false (партия уже списана): коверидж-строки не рендерятся, даже если пришёл полный stockCoverage", () => {
    const consumedView: BrewBatchInventoryView = {
      brewBatchId: "bb-1",
      recipeId: "r-1",
      hasConsumed: true,
      canRestore: true,
      batchAlreadyConsumed: true,
      consumed: [{
        inventoryItemId: "ii-1",
        ingredientDisplayName: "Пильзнер",
        quantityNormalized: 4000,
        normalizedUnit: "g",
        requiredQuantityNormalized: null
      }],
      log: []
    };

    const html = renderToStaticMarkup(
      <BrewInventory
        brewBatchId="bb-1"
        view={consumedView}
        status="brewing"
        stockCoverage={{ totalLines: 4, presentCount: 4, coveredCount: 4, fullyCovered: true }}
      />
    );

    expect(html).not.toContain("Все ингредиенты есть на складе");
    expect(html).not.toContain("На складе");
    expect(html).not.toContain("Ингредиентов этого рецепта нет на складе");
    expect(html).not.toContain("Списать со склада");
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

// Ф2: «Списать со склада» больше не списывает сразу — открывает диалог-предпросмотр
// (ConsumeInventoryDialog, @nb/ui Dialog). Пока диалог закрыт (дефолт), Radix Dialog
// не рендерит содержимое вовсе (проверено эмпирически renderToStaticMarkup) —
// значит кнопка по-прежнему видна, а сам предпросмотр в разметке отсутствует.
describe("BrewInventory — Ф2: кнопка открывает предпросмотр, не списывает напрямую", () => {
  const freshView: BrewBatchInventoryView = {
    brewBatchId: "bb-4",
    recipeId: "r-1",
    hasConsumed: false,
    canRestore: false,
    batchAlreadyConsumed: false,
    consumed: [],
    log: []
  };

  it("кнопка «Списать со склада» видна, содержимое диалога-предпросмотра в разметку не попадает (диалог закрыт по умолчанию)", () => {
    const html = renderToStaticMarkup(<BrewInventory brewBatchId="bb-4" view={freshView} status="planned" />);

    expect(html).toContain("Списать со склада");
    // Заголовок диалога предпросмотра не должен просочиться, пока он закрыт.
    expect(html).not.toContain("Считаем");
  });
});

// Ф2: строка-замена в виде «что списано» честно называет исходный продукт рецепта,
// вместо которого списана эта позиция (substitutedFor из серверного контракта).
describe("BrewInventory — Ф2: пометка «вместо ...» у списанной замены", () => {
  const substitutedView: BrewBatchInventoryView = {
    brewBatchId: "bb-5",
    recipeId: "r-1",
    hasConsumed: true,
    canRestore: true,
    batchAlreadyConsumed: true,
    consumed: [
      {
        inventoryItemId: "ii-1",
        ingredientDisplayName: "Курский пилс",
        quantityNormalized: 5000,
        normalizedUnit: "g",
        requiredQuantityNormalized: null,
        substitutedFor: "Beerex пилснер"
      }
    ],
    log: []
  };

  it("показывает и списанную позицию, и исходную строку рецепта, которую она закрыла", () => {
    const html = renderToStaticMarkup(<BrewInventory brewBatchId="bb-5" view={substitutedView} status="brewing" />);

    expect(html).toContain("Курский пилс");
    expect(html).toContain("вместо «Beerex пилснер»");
  });

  it("не показывает пометку, если substitutedFor не пришёл (списано с точной позиции)", () => {
    const html = renderToStaticMarkup(
      <BrewInventory
        brewBatchId="bb-5"
        view={{
          ...substitutedView,
          consumed: [{ ...substitutedView.consumed[0], substitutedFor: null }]
        }}
        status="brewing"
      />
    );

    expect(html).not.toContain("вместо «");
  });
});
