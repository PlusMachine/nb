import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// Транзакционный маркер: db.transaction зовёт колбэк с этим объектом вместо
// реального drizzle-tx (паттерн tests/inventory-service.test.ts:78-166) — все
// add/delete-вызовы внутри транзакции должны получить именно его 4-м/3-м
// аргументом (client), а не голый `db`.
const { TX_MARKER } = vi.hoisted(() => ({ TX_MARKER: { marker: "tx-stub" } }));

vi.mock("@nb/db", () => ({
  db: {
    transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX_MARKER))
  }
}));

vi.mock("../features/brew-batches/service", () => ({ listBrewBatchesForUser: vi.fn() }));
vi.mock("../features/recipes/match-service", () => ({
  computeRecipeMatchesForUser: vi.fn(),
  computeRecipeMatchesForBrewBatches: vi.fn()
}));
vi.mock("../features/recipes/service", () => ({ listSavedRecipes: vi.fn(), listOwnRecipeRefs: vi.fn() }));
vi.mock("../features/shopping/data", () => ({
  loadManualItems: vi.fn(),
  loadLineChecks: vi.fn(),
  deleteLineCheckStrict: vi.fn(async () => {}),
  deleteManualItemRow: vi.fn(async () => {}),
  pruneOrphanLineChecks: vi.fn(async () => {}),
  setLineChecked: vi.fn(async () => {}),
  // По умолчанию — все запрошенные catalogId «активны» (сохраняет прежнее
  // поведение существующих тестов, которые не про деактивацию). Тест (и) ниже
  // переопределяет через mockResolvedValueOnce/mockResolvedValue.
  loadActiveCatalogIds: vi.fn(async (ids: string[]) => new Set(ids))
}));
vi.mock("../features/inventory/service", () => ({
  addCatalogIngredientToInventory: vi.fn(async () => ({ id: "inv-new" })),
  addCustomIngredientToInventory: vi.fn(async () => ({ id: "inv-new" })),
  assertInventoryItemCreationAllowed: vi.fn(async () => {})
}));

import { db } from "@nb/db";
import { transferCheckedToStock } from "../features/shopping/service";
import { listBrewBatchesForUser } from "../features/brew-batches/service";
import { computeRecipeMatchesForBrewBatches } from "../features/recipes/match-service";
import {
  deleteLineCheckStrict,
  deleteManualItemRow,
  loadActiveCatalogIds,
  loadLineChecks,
  loadManualItems
} from "../features/shopping/data";
import {
  addCatalogIngredientToInventory,
  addCustomIngredientToInventory,
  assertInventoryItemCreationAllowed
} from "../features/inventory/service";
import { INVENTORY_ITEM_CREATE_RATE_LIMIT } from "../features/inventory/contracts";
import type { RecipeMatchDto, RecipeMatchLineDto } from "../features/recipes/contracts";
import type { TransferLineInput } from "../features/shopping/contracts";

// --- фикстуры (см. tests/shopping-list-service.test.ts — та же форма) ------

const plannedBatch = (overrides: Record<string, unknown> = {}) => ({
  id: "bb-1",
  name: "Кухонная варка",
  status: "planned" as const,
  recipeId: "r-1",
  recipeTitle: "IPA рецепт",
  hasDevice: false,
  plannedFor: null,
  startedAt: null,
  completedAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  ...overrides
});

const missingLine = (overrides: Partial<RecipeMatchLineDto> = {}): RecipeMatchLineDto => ({
  recipeIngredientId: "ri-1",
  persistentKey: "ri-1-pk",
  displayOrder: 0,
  ingredientDisplayName: "Citra",
  category: "hop",
  brand: null,
  status: "missing",
  coveragePercent: 0,
  requiredQuantityNormalized: 50,
  availableQuantityNormalized: 0,
  shortfallNormalized: 50,
  normalizedUnit: "g",
  viaSubstitute: false,
  ingredientCatalogItemId: "cat-citra",
  userCustomIngredientId: null,
  suggestedAddQuantity: 50,
  suggestedAddUnit: "g",
  ...overrides
});

const matchDto = (recipeId: string, lines: RecipeMatchLineDto[], overrides: Partial<RecipeMatchDto> = {}): RecipeMatchDto => ({
  recipeId,
  matchPercent: 50,
  label: "partial",
  totalLines: lines.length,
  coveredLines: 0,
  missingCount: lines.filter((line) => line.status === "missing").length,
  lines,
  targetBatchVolumeL: 20,
  recipeBatchVolumeL: 20,
  scaledToInventory: false,
  hasEquipmentProfile: null,
  ...overrides
});

const manualItemRow = (overrides: Record<string, unknown> = {}) => ({
  id: "mi-1",
  userId: "u-1",
  name: "Cascade про запас",
  quantity: 100,
  unit: "g",
  category: "hop",
  ingredientCatalogItemId: null,
  userCustomIngredientId: "custom-1",
  checkedAt: new Date("2026-01-02"),
  position: 0,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  ...overrides
});

beforeEach(() => {
  vi.clearAllMocks();
  (listBrewBatchesForUser as Mock).mockResolvedValue([]);
  (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({});
  (loadLineChecks as Mock).mockResolvedValue(new Set<string>());
  (loadManualItems as Mock).mockResolvedValue([]);
  (assertInventoryItemCreationAllowed as Mock).mockResolvedValue(undefined);
  (addCatalogIngredientToInventory as Mock).mockResolvedValue({ id: "inv-new" });
  (addCustomIngredientToInventory as Mock).mockResolvedValue({ id: "inv-new" });
  (deleteLineCheckStrict as Mock).mockResolvedValue(undefined);
  (deleteManualItemRow as Mock).mockResolvedValue(undefined);
  (loadActiveCatalogIds as Mock).mockImplementation(async (ids: string[]) => new Set(ids));
});

describe("transferCheckedToStock", () => {
  it("(а) полный успех: N insert-вызовов с client=tx и skipCreationGate, N удалений в tx, барьер вызван РОВНО один раз с accepted.length", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch()]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [missingLine()])
    });
    (loadLineChecks as Mock).mockResolvedValue(new Set(["catalog:cat-citra|g"]));
    (loadManualItems as Mock).mockResolvedValue([manualItemRow({ id: "mi-1" })]);

    const lines: TransferLineInput[] = [
      { kind: "derived", lineKey: "catalog:cat-citra|g", quantity: 60, unit: "g" },
      { kind: "manual", id: "mi-1", quantity: 100, unit: "g" }
    ];

    const result = await transferCheckedToStock("u-1", lines);

    expect(result).toEqual({ transferredCount: 2, skippedCount: 0 });
    expect(assertInventoryItemCreationAllowed).toHaveBeenCalledTimes(1);
    expect(assertInventoryItemCreationAllowed).toHaveBeenCalledWith("u-1", 2);
    expect(db.transaction).toHaveBeenCalledTimes(1);

    // Derived-строка привязана к каталогу → addCatalog…, client=tx, skipCreationGate.
    expect(addCatalogIngredientToInventory).toHaveBeenCalledTimes(1);
    const catalogCallArgs = (addCatalogIngredientToInventory as Mock).mock.calls[0];
    expect(catalogCallArgs[0]).toBe("u-1");
    expect(catalogCallArgs[1]).toMatchObject({ ingredientCatalogItemId: "cat-citra", enteredQuantity: 60, enteredUnit: "g" });
    expect(catalogCallArgs[2]).toEqual({ skipCreationGate: true });
    expect(catalogCallArgs[3]).toBe(TX_MARKER);

    // Manual-строка привязана к своему ингредиенту → addCustom…, client=tx.
    expect(addCustomIngredientToInventory).toHaveBeenCalledTimes(1);
    const customCallArgs = (addCustomIngredientToInventory as Mock).mock.calls[0];
    expect(customCallArgs[0]).toBe("u-1");
    expect(customCallArgs[1]).toMatchObject({ userCustomIngredientId: "custom-1", enteredQuantity: 100, enteredUnit: "g" });
    expect(customCallArgs[2]).toEqual({ skipCreationGate: true });
    expect(customCallArgs[3]).toBe(TX_MARKER);

    // Отметка derived-строки удаляется, ручная позиция удаляется целиком.
    expect(deleteLineCheckStrict).toHaveBeenCalledTimes(1);
    expect(deleteLineCheckStrict).toHaveBeenCalledWith("u-1", "catalog:cat-citra|g", TX_MARKER);
    expect(deleteManualItemRow).toHaveBeenCalledTimes(1);
    expect(deleteManualItemRow).toHaveBeenCalledWith("u-1", "mi-1", TX_MARKER);
  });

  it("(б) строка не отмечена на сервере → skipped, остальные перенесены", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch()]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [
        missingLine({ recipeIngredientId: "ri-1", ingredientCatalogItemId: "cat-a" }),
        missingLine({ recipeIngredientId: "ri-2", ingredientCatalogItemId: "cat-b" })
      ])
    });
    // Только cat-a отмечена на сервере — cat-b не отмечена, хотя клиент шлёт обе.
    (loadLineChecks as Mock).mockResolvedValue(new Set(["catalog:cat-a|g"]));

    const lines: TransferLineInput[] = [
      { kind: "derived", lineKey: "catalog:cat-a|g", quantity: 50, unit: "g" },
      { kind: "derived", lineKey: "catalog:cat-b|g", quantity: 50, unit: "g" }
    ];

    const result = await transferCheckedToStock("u-1", lines);

    expect(result).toEqual({ transferredCount: 1, skippedCount: 1 });
    expect(addCatalogIngredientToInventory).toHaveBeenCalledTimes(1);
    expect((addCatalogIngredientToInventory as Mock).mock.calls[0][1]).toMatchObject({ ingredientCatalogItemId: "cat-a" });
    expect(deleteLineCheckStrict).toHaveBeenCalledTimes(1);
    expect(deleteLineCheckStrict).toHaveBeenCalledWith("u-1", "catalog:cat-a|g", TX_MARKER);
  });

  it("(в) name-only строка (без привязки) → skipped, привязанная — переносится", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch()]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [
        missingLine({ recipeIngredientId: "ri-1", ingredientCatalogItemId: "cat-a" }),
        missingLine({
          recipeIngredientId: "ri-2",
          ingredientDisplayName: "Кориандр",
          ingredientCatalogItemId: null,
          userCustomIngredientId: null
        })
      ])
    });
    (loadLineChecks as Mock).mockResolvedValue(new Set(["catalog:cat-a|g", "name:кориандр|g"]));

    const lines: TransferLineInput[] = [
      { kind: "derived", lineKey: "catalog:cat-a|g", quantity: 50, unit: "g" },
      { kind: "derived", lineKey: "name:кориандр|g", quantity: 10, unit: "g" }
    ];

    const result = await transferCheckedToStock("u-1", lines);

    expect(result).toEqual({ transferredCount: 1, skippedCount: 1 });
    expect(addCatalogIngredientToInventory).toHaveBeenCalledTimes(1);
    expect(addCustomIngredientToInventory).not.toHaveBeenCalled();
  });

  it("(г) ошибка на k-й строке → транзакция пробрасывает, удаления второй строки не «зачтены»", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch()]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [
        missingLine({ recipeIngredientId: "ri-1", ingredientCatalogItemId: "cat-a" }),
        missingLine({ recipeIngredientId: "ri-2", ingredientCatalogItemId: "cat-b" })
      ])
    });
    (loadLineChecks as Mock).mockResolvedValue(new Set(["catalog:cat-a|g", "catalog:cat-b|g"]));

    let call = 0;
    (addCatalogIngredientToInventory as Mock).mockImplementation(async () => {
      call += 1;
      if (call === 2) {
        throw new Error("BOOM");
      }
      return { id: `inv-${call}` };
    });

    const lines: TransferLineInput[] = [
      { kind: "derived", lineKey: "catalog:cat-a|g", quantity: 50, unit: "g" },
      { kind: "derived", lineKey: "catalog:cat-b|g", quantity: 50, unit: "g" }
    ];

    await expect(transferCheckedToStock("u-1", lines)).rejects.toThrow("BOOM");

    // Первая строка успела вставиться И удалить свою отметку до того, как
    // вторая упала — но результат всё равно проброшен как ошибка (реальная
    // БД-транзакция откатит обе; здесь важно, что вторая строка не «зачтена»
    // явным вызовом её собственного deleteLineCheckStrict).
    expect(deleteLineCheckStrict).toHaveBeenCalledTimes(1);
    expect(deleteLineCheckStrict).toHaveBeenCalledWith("u-1", "catalog:cat-a|g", TX_MARKER);
    expect(deleteLineCheckStrict).not.toHaveBeenCalledWith("u-1", "catalog:cat-b|g", TX_MARKER);
  });

  it("(д) manual-ветка: удаляется ручная позиция, а не отметка", async () => {
    (loadManualItems as Mock).mockResolvedValue([manualItemRow({ id: "mi-1" })]);

    const lines: TransferLineInput[] = [{ kind: "manual", id: "mi-1", quantity: 100, unit: "g" }];

    const result = await transferCheckedToStock("u-1", lines);

    expect(result).toEqual({ transferredCount: 1, skippedCount: 0 });
    expect(deleteManualItemRow).toHaveBeenCalledTimes(1);
    expect(deleteManualItemRow).toHaveBeenCalledWith("u-1", "mi-1", TX_MARKER);
    expect(deleteLineCheckStrict).not.toHaveBeenCalled();
  });

  it("(е) accepted пуст → transferredCount 0, инвентарь не вызывался, транзакция не открывалась", async () => {
    // Ни отметок, ни ручных позиций на сервере нет — вход всё равно шлёт строку.
    const lines: TransferLineInput[] = [{ kind: "derived", lineKey: "catalog:cat-a|g", quantity: 50, unit: "g" }];

    const result = await transferCheckedToStock("u-1", lines);

    expect(result).toEqual({ transferredCount: 0, skippedCount: 1 });
    expect(assertInventoryItemCreationAllowed).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(addCatalogIngredientToInventory).not.toHaveBeenCalled();
    expect(addCustomIngredientToInventory).not.toHaveBeenCalled();
  });

  it("(ж) пачка больше INVENTORY_ITEM_CREATE_RATE_LIMIT → TRANSFER_TOO_MANY_LINES ДО барьера, транзакция не открывается", async () => {
    const batchSize = INVENTORY_ITEM_CREATE_RATE_LIMIT + 1;
    const missingLines = Array.from({ length: batchSize }, (_, i) =>
      missingLine({ recipeIngredientId: `ri-${i}`, ingredientCatalogItemId: `cat-${i}` })
    );
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch()]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", missingLines)
    });
    (loadLineChecks as Mock).mockResolvedValue(
      new Set(missingLines.map((line) => `catalog:${line.ingredientCatalogItemId}|g`))
    );

    const lines: TransferLineInput[] = missingLines.map((line) => ({
      kind: "derived",
      lineKey: `catalog:${line.ingredientCatalogItemId}|g`,
      quantity: 10,
      unit: "g"
    }));

    await expect(transferCheckedToStock("u-1", lines)).rejects.toThrow("TRANSFER_TOO_MANY_LINES");

    // Падает ДО барьера — rate-limit окно не должно жечься на обречённый запрос.
    expect(assertInventoryItemCreationAllowed).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("(з) дубль lineKey во входе → одна позиция склада, повтор идёт в skippedCount", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch()]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [missingLine()])
    });
    (loadLineChecks as Mock).mockResolvedValue(new Set(["catalog:cat-citra|g"]));

    const lines: TransferLineInput[] = [
      { kind: "derived", lineKey: "catalog:cat-citra|g", quantity: 60, unit: "g" },
      { kind: "derived", lineKey: "catalog:cat-citra|g", quantity: 60, unit: "g" }
    ];

    const result = await transferCheckedToStock("u-1", lines);

    expect(result).toEqual({ transferredCount: 1, skippedCount: 1 });
    expect(addCatalogIngredientToInventory).toHaveBeenCalledTimes(1);
    expect(assertInventoryItemCreationAllowed).toHaveBeenCalledWith("u-1", 1);
  });

  it("(и) деактивированный catalogId → строка skipped, остальные перенесены (loadActiveCatalogIds)", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch()]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [
        missingLine({ recipeIngredientId: "ri-1", ingredientCatalogItemId: "cat-active" }),
        missingLine({ recipeIngredientId: "ri-2", ingredientCatalogItemId: "cat-deactivated" })
      ])
    });
    (loadLineChecks as Mock).mockResolvedValue(new Set(["catalog:cat-active|g", "catalog:cat-deactivated|g"]));
    // Только cat-active остаётся активным на момент переноса.
    (loadActiveCatalogIds as Mock).mockResolvedValue(new Set(["cat-active"]));

    const lines: TransferLineInput[] = [
      { kind: "derived", lineKey: "catalog:cat-active|g", quantity: 50, unit: "g" },
      { kind: "derived", lineKey: "catalog:cat-deactivated|g", quantity: 50, unit: "g" }
    ];

    const result = await transferCheckedToStock("u-1", lines);

    expect(result).toEqual({ transferredCount: 1, skippedCount: 1 });
    expect(addCatalogIngredientToInventory).toHaveBeenCalledTimes(1);
    expect((addCatalogIngredientToInventory as Mock).mock.calls[0][1]).toMatchObject({ ingredientCatalogItemId: "cat-active" });
    expect(loadActiveCatalogIds).toHaveBeenCalledWith(expect.arrayContaining(["cat-active", "cat-deactivated"]));
  });

  it("(к) deleteLineCheckStrict бросает NOT_FOUND (отметка исчезла до транзакции) → ошибка пробрасывается", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch()]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [missingLine()])
    });
    (loadLineChecks as Mock).mockResolvedValue(new Set(["catalog:cat-citra|g"]));
    (deleteLineCheckStrict as Mock).mockRejectedValue(new Error("NOT_FOUND"));

    const lines: TransferLineInput[] = [
      { kind: "derived", lineKey: "catalog:cat-citra|g", quantity: 60, unit: "g" }
    ];

    await expect(transferCheckedToStock("u-1", lines)).rejects.toThrow("NOT_FOUND");
    expect(addCatalogIngredientToInventory).toHaveBeenCalledTimes(1);
  });
});
