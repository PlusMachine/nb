import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Server actions не участвуют — мокаем, чтобы импорт клиентского компонента не
// тянул за собой server actions (db-слой).
vi.mock("@/app/(app)/app/brew-batches/[id]/actions", () => ({
  consumeBrewBatchInventoryAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  previewBrewBatchInventoryAction: vi.fn(async () => ({ ok: true, message: "", plan: undefined }))
}));

import {
  computeOverbookedInventoryItems,
  ConsumeInventoryDialog,
  ConsumeLineRow,
  getBlockingShortLines,
  type SubstitutionSelections
} from "../features/brew-batches/components/consume-preview-dialog";
import type { BrewBatchConsumePlanLine } from "../features/brew-batches/contracts";

describe("ConsumeInventoryDialog — обвязка (Radix Dialog/Portal вне jsdom не рендерит содержимое)", () => {
  // Среда тестов — vitest environment "node" (без jsdom): Radix Dialog рендерит
  // содержимое через Portal, а Portal требует document → в renderToStaticMarkup
  // ничего не выводит НЕЗАВИСИМО от open (проверено эмпирически). Значит и
  // useEffect (загрузка плана) никогда не выполняется при таком рендере — сам
  // диалог тестируется на уровне подкомпонента ConsumeLineRow (ниже), а не здесь.
  it("ни open=false, ни open=true не дают содержимого в статическом рендере (портал вне DOM-окружения)", () => {
    expect(
      renderToStaticMarkup(
        <ConsumeInventoryDialog open={false} brewBatchId="bb-1" onOpenChange={() => {}} onConsumed={() => {}} />
      )
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <ConsumeInventoryDialog open={true} brewBatchId="bb-1" onOpenChange={() => {}} onConsumed={() => {}} />
      )
    ).toBe("");
  });
});

// Рендер-контракт каждого вида строки плана (Ф2/Ф1) — источник контрактных типов:
// features/brew-batches/contracts.ts (BrewBatchConsumePlanLine).
describe("ConsumeLineRow — рендер по видам строки предпросмотра (Ф2/Ф1)", () => {
  const renderRow = (line: BrewBatchConsumePlanLine, selection?: { checked: boolean; inventoryItemId: string }) =>
    renderToStaticMarkup(
      <ul>
        <ConsumeLineRow line={line} selection={selection} onToggle={() => {}} onChooseCandidate={() => {}} />
      </ul>
    );

  it("exact: имя + требуемое количество, без чекбокса и предупреждения", () => {
    const html = renderRow({
      recipeIngredientId: "ri-1",
      displayName: "Citra",
      category: "hop",
      requiredLabel: "120 г",
      requiredQuantityNormalized: 120,
      kind: "exact",
      exactClamps: false,
      exact: { inventoryItemId: "ii-1", name: "Citra", availableQuantity: 200, availableLabel: "200 г", isShort: false, comparison: null },
      substitutes: [],
      catalogSearchHref: null
    });

    expect(html).toContain("Citra");
    expect(html).toContain("−120 г");
    expect(html).not.toContain("checkbox");
    expect(html).not.toContain("остаток");
  });

  it("exact_short + exactClamps=true (дрожжи): тёплый (warning) стиль, «спишем остаток», без замены", () => {
    const html = renderRow({
      recipeIngredientId: "ri-2",
      displayName: "US-05",
      category: "yeast",
      requiredLabel: "22 г",
      requiredQuantityNormalized: 22,
      kind: "exact_short",
      exactClamps: true,
      exact: { inventoryItemId: "ii-2", name: "US-05", availableQuantity: 11, availableLabel: "11 г", isShort: true, comparison: null },
      substitutes: [],
      catalogSearchHref: null
    });

    expect(html).toContain("US-05");
    expect(html).toContain("−22 г");
    expect(html).toContain("На складе 11 г");
    expect(html).toContain("спишем остаток");
    expect(html).not.toContain("не хватит");
    expect(html).toContain("text-warning");
    expect(html).not.toContain("checkbox");
    expect(html).not.toContain("вместо «");
  });

  it("exact_short + exactClamps=false (солод): «не хватит» + та же замена, что у substitute_available", () => {
    const line: BrewBatchConsumePlanLine = {
      recipeIngredientId: "ri-2b",
      displayName: "Munich BrandA",
      category: "fermentable",
      requiredLabel: "2 кг",
      requiredQuantityNormalized: 2000,
      kind: "exact_short",
      exactClamps: false,
      exact: { inventoryItemId: "ii-2b", name: "Munich BrandA", availableQuantity: 500, availableLabel: "500 г", isShort: true, comparison: null },
      substitutes: [
        { inventoryItemId: "ii-sub", name: "Munich BrandB", availableQuantity: 5000, availableLabel: "5 кг", isShort: false, comparison: "EBC 16 ↔ 18" }
      ],
      catalogSearchHref: null
    };

    const uncheckedHtml = renderRow(line, { checked: false, inventoryItemId: "ii-sub" });
    expect(uncheckedHtml).toContain("На складе 500 г");
    expect(uncheckedHtml).toContain("не хватит");
    expect(uncheckedHtml).not.toContain("спишем остаток");
    expect(uncheckedHtml).toContain("вместо «Munich BrandA»");
    expect(uncheckedHtml).toContain("Munich BrandB");
    expect(uncheckedHtml).toContain("EBC 16 ↔ 18");

    const checkedHtml = renderRow(line, { checked: true, inventoryItemId: "ii-sub" });
    expect(checkedHtml).toContain("checked=\"\"");
  });

  it("substitute_available: чекбокс снят по умолчанию (opt-in), показывает «вместо» и EBC/α-сравнение", () => {
    const line: BrewBatchConsumePlanLine = {
      recipeIngredientId: "ri-3",
      displayName: "Beerex пилснер",
      category: "fermentable",
      requiredLabel: "5 кг",
      requiredQuantityNormalized: 5000,
      kind: "substitute_available",
      exactClamps: false,
      exact: null,
      substitutes: [
        {
          inventoryItemId: "ii-3",
          name: "Курский пилс",
          availableQuantity: 8000,
          availableLabel: "8 кг",
          isShort: false,
          comparison: "EBC 4.1 ↔ 5.3"
        }
      ],
      catalogSearchHref: null
    };

    const uncheckedHtml = renderRow(line, { checked: false, inventoryItemId: "ii-3" });
    expect(uncheckedHtml).toContain("Курский пилс");
    expect(uncheckedHtml).toContain("−5 кг");
    expect(uncheckedHtml).toContain("вместо «Beerex пилснер»");
    expect(uncheckedHtml).toContain("EBC 4.1 ↔ 5.3");
    // Единственный кандидат — выбора (select) можно не показывать.
    expect(uncheckedHtml).not.toContain("<select");

    const checkedHtml = renderRow(line, { checked: true, inventoryItemId: "ii-3" });
    expect(checkedHtml).toContain("checked=\"\"");
  });

  it("substitute_available: несколько кандидатов — есть выбор, дефолт первый из отсортированных сервером", () => {
    const line: BrewBatchConsumePlanLine = {
      recipeIngredientId: "ri-4",
      displayName: "Beerex пилснер",
      category: "fermentable",
      requiredLabel: "5 кг",
      requiredQuantityNormalized: 5000,
      kind: "substitute_available",
      exactClamps: false,
      exact: null,
      substitutes: [
        { inventoryItemId: "ii-a", name: "Курский пилс", availableQuantity: 8000, availableLabel: "8 кг", isShort: false, comparison: "EBC 4.1 ↔ 5.3" },
        { inventoryItemId: "ii-b", name: "Другой пилснер", availableQuantity: 3000, availableLabel: "3 кг", isShort: false, comparison: "EBC 4.5 ↔ 5.3" }
      ],
      catalogSearchHref: null
    };

    const html = renderRow(line, { checked: false, inventoryItemId: "ii-a" });
    expect(html).toContain("<select");
    expect(html).toContain("Курский пилс");
    expect(html).toContain("Другой пилснер");
    // Селект неактивен, пока чекбокс не отмечен.
    expect(html).toMatch(/<select[^>]*disabled/);
  });

  it("missing: имя + «Нет на складе» + ссылки «Найти в каталоге» и «Чего не хватает»", () => {
    const html = renderRow({
      recipeIngredientId: "ri-5",
      displayName: "Каскад",
      category: "hop",
      requiredLabel: "30 г",
      requiredQuantityNormalized: 30,
      kind: "missing",
      exactClamps: false,
      exact: null,
      substitutes: [],
      catalogSearchHref: "/catalog/system/abc"
    });

    expect(html).toContain("Каскад");
    expect(html).toContain("Нет на складе");
    expect(html).toContain('href="/catalog/system/abc"');
    expect(html).toContain("Найти в каталоге");
    expect(html).toContain('href="/app/shopping"');
    expect(html).toContain("Чего не хватает");
  });

  it("missing без привязки к каталогу: только «Чего не хватает», без битой ссылки поиска", () => {
    const html = renderRow({
      recipeIngredientId: "ri-6",
      displayName: "Неизвестный хмель",
      category: "hop",
      requiredLabel: "10 г",
      requiredQuantityNormalized: 10,
      kind: "missing",
      exactClamps: false,
      exact: null,
      substitutes: [],
      catalogSearchHref: null
    });

    expect(html).not.toContain("Найти в каталоге");
    expect(html).toContain('href="/app/shopping"');
  });
});

// Ф1(в): чистый гард — список строк, блокирующих подтверждение (короткий exact,
// не клампится, замена не отмечена). Тестируется без DOM.
describe("getBlockingShortLines — чистая функция", () => {
  const shortLine = (overrides: Partial<BrewBatchConsumePlanLine> = {}): BrewBatchConsumePlanLine => ({
    recipeIngredientId: "ri-short",
    displayName: "Munich BrandA",
    category: "fermentable",
    requiredLabel: "2 кг",
    requiredQuantityNormalized: 2000,
    kind: "exact_short",
    exactClamps: false,
    exact: { inventoryItemId: "ii-exact", name: "Munich BrandA", availableQuantity: 500, availableLabel: "500 г", isShort: true, comparison: null },
    substitutes: [
      { inventoryItemId: "ii-sub", name: "Munich BrandB", availableQuantity: 5000, availableLabel: "5 кг", isShort: false, comparison: null }
    ],
    catalogSearchHref: null,
    ...overrides
  });

  it("короткий exact без клампа и без отмеченной замены — блокирует", () => {
    const lines = [shortLine()];
    expect(getBlockingShortLines(lines, {})).toHaveLength(1);
  });

  it("тот же короткий exact, но замена отмечена — не блокирует", () => {
    const lines = [shortLine()];
    const selections: SubstitutionSelections = { "ri-short": { checked: true, inventoryItemId: "ii-sub" } };
    expect(getBlockingShortLines(lines, selections)).toHaveLength(0);
  });

  it("короткий exact с exactClamps=true (дрожжи) — не блокирует (кламп легален)", () => {
    const lines = [shortLine({ exactClamps: true, substitutes: [] })];
    expect(getBlockingShortLines(lines, {})).toHaveLength(0);
  });

  it("kind=exact (не short) — не блокирует", () => {
    const lines = [shortLine({ kind: "exact", exact: { inventoryItemId: "ii-exact", name: "Munich BrandA", availableQuantity: 5000, availableLabel: "5 кг", isShort: false, comparison: null } })];
    expect(getBlockingShortLines(lines, {})).toHaveLength(0);
  });
});

// Ф3: гард двойного бронирования одной позиции склада — чистая функция.
describe("computeOverbookedInventoryItems — чистая функция", () => {
  const exactLine = (overrides: Partial<BrewBatchConsumePlanLine>): BrewBatchConsumePlanLine => ({
    recipeIngredientId: overrides.recipeIngredientId ?? "ri-x",
    displayName: "Строка",
    category: "fermentable",
    requiredLabel: "1 кг",
    requiredQuantityNormalized: 1000,
    kind: "exact",
    exactClamps: false,
    exact: null,
    substitutes: [],
    catalogSearchHref: null,
    ...overrides
  });

  it("две строки замен указывают на одну и ту же позицию склада, спрос превышает остаток — overbooked", () => {
    const lineA = exactLine({
      recipeIngredientId: "ri-a",
      kind: "substitute_available",
      requiredQuantityNormalized: 4000,
      substitutes: [{ inventoryItemId: "ii-shared", name: "Курский пилс", availableQuantity: 6000, availableLabel: "6 кг", isShort: false, comparison: null }]
    });
    const lineB = exactLine({
      recipeIngredientId: "ri-b",
      kind: "substitute_available",
      requiredQuantityNormalized: 3000,
      substitutes: [{ inventoryItemId: "ii-shared", name: "Курский пилс", availableQuantity: 6000, availableLabel: "6 кг", isShort: false, comparison: null }]
    });
    const selections: SubstitutionSelections = {
      "ri-a": { checked: true, inventoryItemId: "ii-shared" },
      "ri-b": { checked: true, inventoryItemId: "ii-shared" }
    };

    const overbooked = computeOverbookedInventoryItems([lineA, lineB], selections);
    expect(overbooked).toHaveLength(1);
    expect(overbooked[0]!.inventoryItemId).toBe("ii-shared");
    expect(overbooked[0]!.demandNormalized).toBe(7000);
    expect(overbooked[0]!.availableQuantity).toBe(6000);
  });

  it("exact-строка и отмеченная замена другой строки указывают на одну позицию — суммируется", () => {
    const lineExact = exactLine({
      recipeIngredientId: "ri-exact",
      kind: "exact",
      requiredQuantityNormalized: 4000,
      exact: { inventoryItemId: "ii-shared", name: "Позиция", availableQuantity: 5000, availableLabel: "5 кг", isShort: false, comparison: null }
    });
    const lineSub = exactLine({
      recipeIngredientId: "ri-sub",
      kind: "substitute_available",
      requiredQuantityNormalized: 2000,
      substitutes: [{ inventoryItemId: "ii-shared", name: "Позиция", availableQuantity: 5000, availableLabel: "5 кг", isShort: false, comparison: null }]
    });
    const selections: SubstitutionSelections = { "ri-sub": { checked: true, inventoryItemId: "ii-shared" } };

    const overbooked = computeOverbookedInventoryItems([lineExact, lineSub], selections);
    expect(overbooked).toHaveLength(1);
    expect(overbooked[0]!.demandNormalized).toBe(6000);
  });

  it("спрос в пределах остатка — не overbooked", () => {
    const lineA = exactLine({
      recipeIngredientId: "ri-a",
      kind: "exact",
      requiredQuantityNormalized: 3000,
      exact: { inventoryItemId: "ii-shared", name: "Позиция", availableQuantity: 5000, availableLabel: "5 кг", isShort: false, comparison: null }
    });
    expect(computeOverbookedInventoryItems([lineA], {})).toEqual([]);
  });

  it("дрожжевая (exactClamps=true) строка не участвует в гарде, даже если ссылается на ту же позицию", () => {
    const lineYeast = exactLine({
      recipeIngredientId: "ri-yeast",
      kind: "exact_short",
      exactClamps: true,
      requiredQuantityNormalized: 999999,
      exact: { inventoryItemId: "ii-shared", name: "Позиция", availableQuantity: 1, availableLabel: "1 пачка", isShort: true, comparison: null }
    });
    expect(computeOverbookedInventoryItems([lineYeast], {})).toEqual([]);
  });

  it("substitute_available без отмеченной замены не создаёт спроса", () => {
    const lineSub = exactLine({
      recipeIngredientId: "ri-sub",
      kind: "substitute_available",
      requiredQuantityNormalized: 4000,
      substitutes: [{ inventoryItemId: "ii-shared", name: "Позиция", availableQuantity: 1000, availableLabel: "1 кг", isShort: true, comparison: null }]
    });
    expect(computeOverbookedInventoryItems([lineSub], {})).toEqual([]);
  });
});
