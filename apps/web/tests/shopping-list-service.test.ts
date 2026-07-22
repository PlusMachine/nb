import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";

vi.mock("../features/brew-batches/service", () => ({ listBrewBatchesForUser: vi.fn() }));
vi.mock("../features/recipes/match-service", () => ({
  computeRecipeMatchesForUser: vi.fn(),
  computeRecipeMatchesForBrewBatches: vi.fn()
}));
vi.mock("../features/recipes/service", () => ({ listSavedRecipes: vi.fn(), listOwnRecipeRefs: vi.fn() }));
vi.mock("../features/shopping/data", () => ({
  loadManualItems: vi.fn(),
  // П2: buildShoppingListForUser join'ит отметки и лениво чистит осиротевшие —
  // обе функции нужны как моки, даже когда конкретный тест их не проверяет.
  loadLineChecks: vi.fn(),
  pruneOrphanLineChecks: vi.fn(async () => {}),
  deleteLineCheck: vi.fn(),
  setLineChecked: vi.fn(),
  // П4: варианты фасовки батчем — дефолт [] (строка без catalogId/вариантов
  // ведёт себя как раньше, без packSuggestion).
  loadPackVariantsByCatalogIds: vi.fn(),
  // v4: мета каталога (бренд/страна) — дефолт [] (строка без catalogId или без
  // заполненных полей в БД ведёт себя как раньше, brand/countryName null).
  loadIngredientMetaByCatalogIds: vi.fn()
}));
// buildShoppingListForUser (через computeAggregatedShoppingLines) не зовёт
// ничего из inventory/service — но модуль импортирует его типы/функции на
// уровне файла (нужны transferCheckedToStock), поэтому тут его стабим:
// реальный features/inventory/service.ts тянет "@nb/db" и кучу доменной
// логики, не нужной этому сьюту (паттерн — любой другой тест сервисного слоя,
// не трогающий инвентарь напрямую).
vi.mock("../features/inventory/service", () => ({
  addCatalogIngredientToInventory: vi.fn(),
  addCustomIngredientToInventory: vi.fn(),
  assertInventoryItemCreationAllowed: vi.fn()
}));

import { buildShoppingListForUser } from "../features/shopping/service";
import { listBrewBatchesForUser } from "../features/brew-batches/service";
import { computeRecipeMatchesForBrewBatches, computeRecipeMatchesForUser } from "../features/recipes/match-service";
import { listSavedRecipes, listOwnRecipeRefs } from "../features/recipes/service";
import {
  loadIngredientMetaByCatalogIds,
  loadLineChecks,
  loadManualItems,
  loadPackVariantsByCatalogIds,
  pruneOrphanLineChecks
} from "../features/shopping/data";
import type { RecipeMatchDto, RecipeMatchLineDto } from "../features/recipes/contracts";

// --- фикстуры --------------------------------------------------------------

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

// Строка с нехваткой (missing), готовая как выход matchLineAgainstInventory.
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

// Покрытая строка — не должна попадать ни в §3.2, ни в строки §3.3.
const coveredLine = (overrides: Partial<RecipeMatchLineDto> = {}): RecipeMatchLineDto => ({
  recipeIngredientId: "ri-2",
  persistentKey: "ri-2-pk",
  displayOrder: 1,
  ingredientDisplayName: "Pilsner",
  category: "fermentable",
  brand: null,
  status: "covered",
  coveragePercent: 100,
  requiredQuantityNormalized: 5000,
  availableQuantityNormalized: 5000,
  shortfallNormalized: 0,
  normalizedUnit: "g",
  viaSubstitute: false,
  ingredientCatalogItemId: "cat-pilsner",
  userCustomIngredientId: null,
  suggestedAddQuantity: null,
  suggestedAddUnit: null,
  ...overrides
});

// FIX-1: зеркалим summarizeMatch (match-service.ts) буквально — missingCount
// считает ТОЛЬКО status==="missing". Раньше фикстура здесь считала
// missing+partial, что скрывало несовпадение missingCount/lines.length в §3.3
// (partial-строки не должны попадать в lines возможности вовсе).
const matchDto = (recipeId: string, lines: RecipeMatchLineDto[], overrides: Partial<RecipeMatchDto> = {}): RecipeMatchDto => ({
  recipeId,
  matchPercent: 50,
  label: "partial",
  totalLines: lines.length,
  coveredLines: lines.filter((line) => line.status === "covered" || line.status === "substitute").length,
  missingCount: lines.filter((line) => line.status === "missing").length,
  lines,
  targetBatchVolumeL: 20,
  recipeBatchVolumeL: 20,
  scaledToInventory: false,
  hasEquipmentProfile: null,
  ...overrides
});

const savedRef = (id: string, slug: string, name: string) => ({ id, slug, name });
const ownRef = (id: string, slug: string, title: string) => ({ id, slug, title });

// «Почти можно сварить»-матч с комфортным запасом покрытия типов (≥70% и с
// большим запасом), чтобы missingCount 1-2 сам по себе не сталкивал тест в
// ветку "junk" (<70%) — coveredCount с большим числом строк изолирует то, что
// тест реально проверяет (сортировку/кап/ссылки), от порога покрытия.
const nearMissMatch = (recipeId: string, missingCount: number, coveredCount = 8): RecipeMatchDto => {
  const lines = [
    ...Array.from({ length: coveredCount }, (_, i) => coveredLine({ recipeIngredientId: `${recipeId}-cov-${i}` })),
    ...Array.from({ length: missingCount }, (_, i) =>
      missingLine({ recipeIngredientId: `${recipeId}-miss-${i}`, ingredientCatalogItemId: `${recipeId}-cat-${i}` })
    )
  ];
  return matchDto(recipeId, lines, { missingCount, totalLines: lines.length });
};

// Строка БД ручной позиции (П1) — форма, в которой её отдаёт loadManualItems
// (ManualItemRow = typeof shoppingManualItems.$inferSelect).
const manualItemRow = (overrides: Record<string, unknown> = {}) => ({
  id: "mi-1",
  userId: "u-1",
  name: "Дезинфектант Star San",
  quantity: null,
  unit: null,
  category: null,
  ingredientCatalogItemId: null,
  userCustomIngredientId: null,
  checkedAt: null,
  position: 0,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  ...overrides
});

beforeEach(() => {
  vi.clearAllMocks();
  (listSavedRecipes as Mock).mockResolvedValue([]);
  (listOwnRecipeRefs as Mock).mockResolvedValue({ refs: [], familyIdByVersionId: new Map<string, string>() });
  (computeRecipeMatchesForUser as Mock).mockResolvedValue({});
  (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({});
  (loadManualItems as Mock).mockResolvedValue([]);
  (loadLineChecks as Mock).mockResolvedValue(new Set<string>());
  (pruneOrphanLineChecks as Mock).mockResolvedValue(undefined);
  (loadPackVariantsByCatalogIds as Mock).mockResolvedValue([]);
  (loadIngredientMetaByCatalogIds as Mock).mockResolvedValue([]);
});

// Строка БД варианта фасовки (П4) — форма, в которой её отдаёт
// loadPackVariantsByCatalogIds (PackVariantRow = typeof ingredientPackageVariants.$inferSelect).
const packVariantRow = (overrides: Record<string, unknown> = {}) => ({
  id: "pv-1",
  ingredientId: "cat-citra",
  brand: null,
  productNameEn: null,
  productNameRu: null,
  countryNameRu: null,
  packageAmount: 50,
  packageUnit: "g",
  stockContentAmount: 50,
  stockContentUnit: "g",
  sourceGroup: null,
  sourceUrl: null,
  isDefaultForStock: true,
  position: 0,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  ...overrides
});

// §3.2 матчит ЗАПЛАНИРОВАННЫЕ партии через computeRecipeMatchesForBrewBatches:
// ключ результата — brewBatchId (не recipeId), потому что у каждой партии свой
// кредит уже списанного со склада (A2). §3.3 «Почти хватает на:» по-прежнему
// матчит рецепты-кандидаты по фактическому складу — там партии нет.
describe("buildShoppingListForUser — §3.2 агрегация и фикс бага addToStockHref", () => {
  it("regression §1.1: sums quantityToBuy across two brews and rebuilds addToStockHref from the total", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([
      plannedBatch({ id: "bb-1", recipeId: "r-1", recipeTitle: "IPA", name: "Варка 1" }),
      plannedBatch({ id: "bb-2", recipeId: "r-2", recipeTitle: "Stout", name: "Варка 2" })
    ]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [missingLine({ suggestedAddQuantity: 30 })]),
      "bb-2": matchDto("r-2", [missingLine({ recipeIngredientId: "ri-1b", suggestedAddQuantity: 20 })])
    });

    const dto = await buildShoppingListForUser("u-1");

    expect(dto.totalItems).toBe(1);
    const line = dto.groups.flatMap((group) => group.items)[0];
    expect(line.quantityToBuy).toBe(50);
    expect(line.quantityLabel).toBe("50 г");
    // Раньше addToStockHref строился при создании строки (нехватка первой варки,
    // 30 г) и не пересобирался при досуммировании второй — здесь должна быть сумма.
    expect(line.addToStockHref).toContain("addQty=50");
    expect(line.addToStockHref).toContain("addUnit=g");
    // v4: neededBy несёт per-brew остаток каждой варки (не только имена) —
    // сумма per-brew quantityToBuy равна общему line.quantityToBuy.
    expect(line.neededBy).toEqual([
      { brewBatchId: "bb-1", recipeTitle: "IPA", brewName: "Варка 1", quantityToBuy: 30, unit: "g", quantityLabel: "30 г", packSuggestion: null },
      { brewBatchId: "bb-2", recipeTitle: "Stout", brewName: "Варка 2", quantityToBuy: 20, unit: "g", quantityLabel: "20 г", packSuggestion: null }
    ]);
  });

  // П3: строка-нехватка без каталожной/кастомной привязки (живёт только именем
  // из снапшота — типично для импортированных рецептов) раньше давала оба href
  // null → тупик без действий. Теперь есть фолбэк на поиск по каталогу и
  // deeplink «Добавить свой».
  it("П3: a gap line without a catalog/custom link gets a catalog-search href and a name deeplink instead of null/null", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([
      plannedBatch({ id: "bb-1", recipeId: "r-1" })
    ]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [
        missingLine({
          ingredientDisplayName: "Кориандр молотый",
          category: "consumable",
          ingredientCatalogItemId: null,
          userCustomIngredientId: null,
          suggestedAddQuantity: 10,
          suggestedAddUnit: "g"
        })
      ])
    });

    const dto = await buildShoppingListForUser("u-1");

    const line = dto.groups.flatMap((group) => group.items)[0];
    expect(line.catalogHref).toBe("/catalog?q=%D0%9A%D0%BE%D1%80%D0%B8%D0%B0%D0%BD%D0%B4%D1%80%20%D0%BC%D0%BE%D0%BB%D0%BE%D1%82%D1%8B%D0%B9");
    expect(line.addToStockHref).toBe(
      "/app/ingredients?addName=%D0%9A%D0%BE%D1%80%D0%B8%D0%B0%D0%BD%D0%B4%D1%80%20%D0%BC%D0%BE%D0%BB%D0%BE%D1%82%D1%8B%D0%B9&addQty=10&addUnit=g&addCategory=consumable"
    );
  });

  it("batches the inventory match into a single call for both brews (§1.5)", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([
      plannedBatch({ id: "bb-1", recipeId: "r-1" }),
      plannedBatch({ id: "bb-2", recipeId: "r-2" })
    ]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [coveredLine()]),
      "bb-2": matchDto("r-2", [coveredLine()])
    });

    await buildShoppingListForUser("u-1");

    expect(computeRecipeMatchesForBrewBatches).toHaveBeenCalledTimes(1);
    expect(computeRecipeMatchesForBrewBatches).toHaveBeenCalledWith({
      userId: "u-1",
      batches: [
        { brewBatchId: "bb-1", recipeId: "r-1" },
        { brewBatchId: "bb-2", recipeId: "r-2" }
      ]
    });
    // Кандидатов §3.3 нет → второй матч даже не запрашивается.
    expect(computeRecipeMatchesForUser).not.toHaveBeenCalled();
  });

  it("reports a missingCount chip per planned brew, matching the lines it actually contributed", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([
      plannedBatch({ id: "bb-1", recipeId: "r-1", name: "Варка 1" }),
      plannedBatch({ id: "bb-2", recipeId: "r-2", name: "Варка 2" })
    ]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [
        missingLine({ ingredientCatalogItemId: "cat-citra" }),
        missingLine({ recipeIngredientId: "ri-yeast", ingredientCatalogItemId: "cat-yeast", ingredientDisplayName: "US-05" })
      ]),
      "bb-2": matchDto("r-2", [missingLine({ ingredientCatalogItemId: "cat-citra" })])
    });

    const dto = await buildShoppingListForUser("u-1");

    const brew1 = dto.plannedBrews.find((brew) => brew.brewBatchId === "bb-1");
    const brew2 = dto.plannedBrews.find((brew) => brew.brewBatchId === "bb-2");
    expect(brew1?.missingCount).toBe(2);
    expect(brew2?.missingCount).toBe(1);
  });
});

describe("buildShoppingListForUser — v4: per-brew neededBy (лаборатория, чипы-фильтр по варкам)", () => {
  it("строка, нужная двум варкам, несёт оба brewBatchId с корректными per-brew количествами — сумма равна quantityToBuy", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([
      plannedBatch({ id: "bb-1", recipeId: "r-1", recipeTitle: "IPA", name: "Варка 1" }),
      plannedBatch({ id: "bb-2", recipeId: "r-2", recipeTitle: "Stout", name: "Варка 2" })
    ]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [missingLine({ suggestedAddQuantity: 30 })]),
      "bb-2": matchDto("r-2", [missingLine({ recipeIngredientId: "ri-1b", suggestedAddQuantity: 20 })])
    });

    const dto = await buildShoppingListForUser("u-1");

    const line = dto.groups.flatMap((group) => group.items)[0];
    expect(line.quantityToBuy).toBe(50);
    expect(line.neededBy).toHaveLength(2);
    const brew1Need = line.neededBy.find((need) => need.brewBatchId === "bb-1");
    const brew2Need = line.neededBy.find((need) => need.brewBatchId === "bb-2");
    expect(brew1Need?.quantityToBuy).toBe(30);
    expect(brew2Need?.quantityToBuy).toBe(20);
    const sum = line.neededBy.reduce((acc, need) => acc + need.quantityToBuy, 0);
    expect(sum).toBe(line.quantityToBuy);
  });

  it("два лота одного ингредиента в ОДНОЙ варке суммируются в один per-brew остаток, а не в две записи neededBy", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([
      plannedBatch({ id: "bb-1", recipeId: "r-1", recipeTitle: "IPA", name: "Варка 1" })
    ]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [
        missingLine({ suggestedAddQuantity: 30 }),
        missingLine({ recipeIngredientId: "ri-1-dupe", suggestedAddQuantity: 15 })
      ])
    });

    const dto = await buildShoppingListForUser("u-1");

    const line = dto.groups.flatMap((group) => group.items)[0];
    expect(line.quantityToBuy).toBe(45);
    expect(line.neededBy).toHaveLength(1);
    expect(line.neededBy[0]).toMatchObject({ brewBatchId: "bb-1", quantityToBuy: 45, quantityLabel: "45 г" });
  });

  it("brand/countryName приходят из loadIngredientMetaByCatalogIds по catalogId строки; producer — фолбэк, если brand пуст", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ id: "bb-1", recipeId: "r-1" })]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [
        missingLine({ ingredientCatalogItemId: "cat-citra" }),
        missingLine({
          recipeIngredientId: "ri-yeast",
          ingredientCatalogItemId: "cat-us05",
          ingredientDisplayName: "US-05",
          category: "yeast",
          suggestedAddQuantity: 1,
          suggestedAddUnit: "pack"
        })
      ])
    });
    (loadIngredientMetaByCatalogIds as Mock).mockResolvedValue([
      { id: "cat-citra", brand: "YCH Hops", producer: null, countryName: "США" },
      { id: "cat-us05", brand: null, producer: "Fermentis", countryName: null }
    ]);

    const dto = await buildShoppingListForUser("u-1");

    const lines = dto.groups.flatMap((group) => group.items);
    const citra = lines.find((line) => line.ingredientDisplayName === "Citra");
    const us05 = lines.find((line) => line.ingredientDisplayName === "US-05");
    expect(citra?.brand).toBe("YCH Hops");
    expect(citra?.countryName).toBe("США");
    // producer — фолбэк, когда brand не заполнен.
    expect(us05?.brand).toBe("Fermentis");
    expect(us05?.countryName).toBeNull();
    expect(loadIngredientMetaByCatalogIds).toHaveBeenCalledWith(expect.arrayContaining(["cat-citra", "cat-us05"]));
  });

  it("строка без каталожной привязки — brand/countryName всегда null", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ id: "bb-1", recipeId: "r-1" })]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [
        missingLine({
          ingredientDisplayName: "Кориандр молотый",
          ingredientCatalogItemId: null,
          userCustomIngredientId: null,
          suggestedAddQuantity: 10,
          suggestedAddUnit: "g"
        })
      ])
    });

    const dto = await buildShoppingListForUser("u-1");

    const line = dto.groups.flatMap((group) => group.items)[0];
    expect(line.brand).toBeNull();
    expect(line.countryName).toBeNull();
  });
});

describe("buildShoppingListForUser — A2: списанное под партию не просится в покупки", () => {
  it("состав партии уже списан → §3.2 пустая, чип варки без нехваток", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([
      plannedBatch({ id: "bb-1", recipeId: "r-1", recipeTitle: "Летний пилснер", name: "Летний пилснер" })
    ]);
    // Матч по партии видит кредит списанного → все строки covered.
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [coveredLine()], { missingCount: 0 })
    });

    const dto = await buildShoppingListForUser("u-1");

    expect(dto.totalItems).toBe(0);
    expect(dto.groups).toEqual([]);
    expect(dto.emptyReason).toBe("all_in_stock");
    expect(dto.plannedBrews[0].missingCount).toBe(0);
  });

  it("две партии на один рецепт: нехватка несписавшейся остаётся в полном объёме", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([
      plannedBatch({ id: "bb-1", recipeId: "r-1", recipeTitle: "IPA", name: "Первая" }),
      plannedBatch({ id: "bb-2", recipeId: "r-1", recipeTitle: "IPA", name: "Вторая" })
    ]);
    // bb-1 списала состав (кредит → covered), bb-2 — нет.
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [coveredLine()], { missingCount: 0 }),
      "bb-2": matchDto("r-1", [missingLine({ suggestedAddQuantity: 50 })])
    });

    const dto = await buildShoppingListForUser("u-1");

    // Ключ по brewBatchId, а не по recipeId: иначе кредит bb-1 стёр бы нехватку bb-2
    // (или наоборот — нехватка bb-2 всплыла бы и у bb-1).
    expect(dto.totalItems).toBe(1);
    const line = dto.groups.flatMap((group) => group.items)[0];
    expect(line.quantityToBuy).toBe(50);
    expect(line.neededBy).toEqual([
      { brewBatchId: "bb-2", recipeTitle: "IPA", brewName: "Вторая", quantityToBuy: 50, unit: "g", quantityLabel: "50 г", packSuggestion: null }
    ]);
    expect(dto.plannedBrews.find((brew) => brew.brewBatchId === "bb-1")?.missingCount).toBe(0);
    expect(dto.plannedBrews.find((brew) => brew.brewBatchId === "bb-2")?.missingCount).toBe(1);
    // Обе партии уходят в матч по отдельности, несмотря на общий рецепт.
    expect(computeRecipeMatchesForBrewBatches).toHaveBeenCalledWith({
      userId: "u-1",
      batches: [
        { brewBatchId: "bb-1", recipeId: "r-1" },
        { brewBatchId: "bb-2", recipeId: "r-1" }
      ]
    });
  });
});

describe("buildShoppingListForUser — §3.3 «Почти можно сварить»", () => {
  it("excludes a recipe that already sits behind a planned brew (no duplicate with §3.2)", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ recipeId: "r-1" })]);
    (listSavedRecipes as Mock).mockResolvedValue([savedRef("r-1", "r-1-slug", "IPA рецепт")]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [missingLine()])
    });

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    expect(dto.opportunities).toEqual([]);
    // r-1 не должен попасть в матч кандидатов §3.3 — он уже участвует как
    // запланированная варка (и матчится по партии, с её кредитом).
    expect(computeRecipeMatchesForUser).not.toHaveBeenCalled();
  });

  it("excludes a ready recipe (nothing to buy) from opportunities", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (listSavedRecipes as Mock).mockResolvedValue([savedRef("r-ready", "ready-slug", "Готовый рецепт")]);
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-ready": matchDto("r-ready", [coveredLine()], { missingCount: 0 })
    });

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    expect(dto.opportunities).toEqual([]);
  });

  it("excludes junk matches below 70% type coverage", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (listSavedRecipes as Mock).mockResolvedValue([savedRef("r-junk", "junk-slug", "Слабый матч")]);
    // 4 строки, покрыты только 1 → typeCoverage 25% < 70%
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-junk": matchDto(
        "r-junk",
        [
          coveredLine(),
          missingLine({ recipeIngredientId: "a" }),
          missingLine({ recipeIngredientId: "b" }),
          missingLine({ recipeIngredientId: "c" })
        ],
        { missingCount: 3, totalLines: 4 }
      )
    });

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    expect(dto.opportunities).toEqual([]);
  });

  it("sorts opportunities by missingCount ascending, then by name", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (listSavedRecipes as Mock).mockResolvedValue([
      savedRef("r-b", "b-slug", "Пшеничное летнее"),
      savedRef("r-a", "a-slug", "Юэлл Хазик IPA")
    ]);
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      // оба покрывают ≥70% типов, но у r-b не хватает 2, у r-a — 1
      "r-b": nearMissMatch("r-b", 2),
      "r-a": nearMissMatch("r-a", 1)
    });

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    expect(dto.opportunities.map((entry) => entry.recipeId)).toEqual(["r-a", "r-b"]);
    expect(dto.opportunities.every((entry) => entry.collapsed)).toBe(false);
  });

  it("collapses a recipe missing 3+ items even when ≥70% types are covered", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (listSavedRecipes as Mock).mockResolvedValue([savedRef("r-long", "long-slug", "Длинный рецепт")]);
    // 10 строк, 3 отсутствуют → typeCoverage 0.7 ровно на границе, missing 3 → collapsed
    const lines = [
      ...Array.from({ length: 7 }, (_, i) => coveredLine({ recipeIngredientId: `cov-${i}` })),
      ...Array.from({ length: 3 }, (_, i) => missingLine({ recipeIngredientId: `miss-${i}`, ingredientCatalogItemId: `cat-${i}` }))
    ];
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-long": matchDto("r-long", lines, { missingCount: 3, totalLines: 10 })
    });

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    expect(dto.opportunities).toHaveLength(1);
    expect(dto.opportunities[0].collapsed).toBe(true);
    expect(dto.collapsedOpportunityCount).toBe(1);
    // но строки всё равно приложены — разворачивание по клику без рефетча
    expect(dto.opportunities[0].lines).toHaveLength(3);
  });

  it("caps the expanded tier at 8 recipes, folding the rest into the collapsed bucket", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    const refs = Array.from({ length: 9 }, (_, i) => savedRef(`r-${i}`, `slug-${i}`, `Рецепт ${i}`));
    (listSavedRecipes as Mock).mockResolvedValue(refs);
    const matches: Record<string, RecipeMatchDto> = {};
    for (let i = 0; i < 9; i += 1) {
      matches[`r-${i}`] = nearMissMatch(`r-${i}`, 1);
    }
    (computeRecipeMatchesForUser as Mock).mockResolvedValue(matches);

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    expect(dto.opportunities).toHaveLength(9);
    expect(dto.opportunities.filter((entry) => !entry.collapsed)).toHaveLength(8);
    expect(dto.collapsedOpportunityCount).toBe(1);
  });

  it("links an own recipe to its editor and a saved-only recipe to its public page", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (listSavedRecipes as Mock).mockResolvedValue([savedRef("r-saved", "saved-slug", "Чужой избранный")]);
    (listOwnRecipeRefs as Mock).mockResolvedValue({
      refs: [ownRef("r-own", "own-slug", "Мой рецепт")],
      familyIdByVersionId: new Map([["r-own", "fam-own"]])
    });
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-saved": nearMissMatch("r-saved", 1),
      "r-own": nearMissMatch("r-own", 1)
    });

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    const own = dto.opportunities.find((entry) => entry.recipeId === "r-own");
    const saved = dto.opportunities.find((entry) => entry.recipeId === "r-saved");
    expect(own?.recipeHref).toBe("/app/recipes/r-own/edit");
    expect(saved?.recipeHref).toBe("/recipes/saved-slug");
  });

  it("FIX-1: a match where every gap is 'partial' (no 'missing' lines) is hidden from opportunities", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (listSavedRecipes as Mock).mockResolvedValue([savedRef("r-partial", "partial-slug", "Частично готов")]);
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      // 6 покрыто, 2 partial, 0 missing → missingCount 0 (по FIX-1-фикстуре) → hidden
      "r-partial": matchDto("r-partial", [
        ...Array.from({ length: 6 }, (_, i) => coveredLine({ recipeIngredientId: `cov-${i}` })),
        missingLine({ recipeIngredientId: "gap-1", ingredientCatalogItemId: "cat-gap-1", status: "partial", coveragePercent: 40 }),
        missingLine({ recipeIngredientId: "gap-2", ingredientCatalogItemId: "cat-gap-2", status: "partial", coveragePercent: 60 })
      ])
    });

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    expect(dto.opportunities).toEqual([]);
  });

  it("FIX-1: opportunity.lines contains only 'missing' rows — partial rows are excluded, missingCount matches lines.length", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (listSavedRecipes as Mock).mockResolvedValue([savedRef("r-mix", "mix-slug", "Смешанный")]);
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      // 8 покрыто, 1 missing, 2 partial → typeCoverage по missingCount=1 высокая,
      // не hidden; в lines должна попасть ровно 1 (missing) позиция.
      "r-mix": matchDto("r-mix", [
        ...Array.from({ length: 8 }, (_, i) => coveredLine({ recipeIngredientId: `cov-${i}` })),
        missingLine({ recipeIngredientId: "miss-1", ingredientCatalogItemId: "cat-miss-1" }),
        missingLine({ recipeIngredientId: "part-1", ingredientCatalogItemId: "cat-part-1", status: "partial", coveragePercent: 30 }),
        missingLine({ recipeIngredientId: "part-2", ingredientCatalogItemId: "cat-part-2", status: "partial", coveragePercent: 70 })
      ])
    });

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    expect(dto.opportunities).toHaveLength(1);
    const opportunity = dto.opportunities[0];
    expect(opportunity.missingCount).toBe(1);
    expect(opportunity.lines).toHaveLength(1);
    expect(opportunity.lines[0].ingredientDisplayName).toBe("Citra");
  });

  it("FIX-1: a missing line without a suggested add amount still shows up, with null quantity fields and an amount-less add-to-stock link", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (listSavedRecipes as Mock).mockResolvedValue([savedRef("r-noamt", "noamt-slug", "Без предложения")]);
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-noamt": matchDto("r-noamt", [
        ...Array.from({ length: 8 }, (_, i) => coveredLine({ recipeIngredientId: `cov-${i}` })),
        missingLine({
          recipeIngredientId: "miss-noamt",
          ingredientCatalogItemId: "cat-noamt",
          suggestedAddQuantity: null,
          suggestedAddUnit: null
        })
      ])
    });

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    expect(dto.opportunities).toHaveLength(1);
    const line = dto.opportunities[0].lines[0];
    expect(line.quantityToBuy).toBeNull();
    expect(line.unit).toBeNull();
    expect(line.quantityLabel).toBeNull();
    expect(line.addToStockHref).toBe("/app/ingredients?addSource=catalog&addId=cat-noamt");
  });

  it("П3: an opportunity gap line without any link falls back to catalog search + name deeplink", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (listSavedRecipes as Mock).mockResolvedValue([savedRef("r-name", "name-slug", "Импортированный рецепт")]);
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-name": matchDto("r-name", [
        ...Array.from({ length: 8 }, (_, i) => coveredLine({ recipeIngredientId: `cov-${i}` })),
        missingLine({
          recipeIngredientId: "miss-name",
          ingredientDisplayName: "Ирландский мох",
          category: "consumable",
          ingredientCatalogItemId: null,
          userCustomIngredientId: null,
          suggestedAddQuantity: null,
          suggestedAddUnit: null
        })
      ])
    });

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    expect(dto.opportunities).toHaveLength(1);
    const line = dto.opportunities[0].lines[0];
    expect(line.catalogHref).toBe("/catalog?q=%D0%98%D1%80%D0%BB%D0%B0%D0%BD%D0%B4%D1%81%D0%BA%D0%B8%D0%B9%20%D0%BC%D0%BE%D1%85");
    expect(line.addToStockHref).toBe(
      "/app/ingredients?addName=%D0%98%D1%80%D0%BB%D0%B0%D0%BD%D0%B4%D1%81%D0%BA%D0%B8%D0%B9%20%D0%BC%D0%BE%D1%85&addCategory=consumable"
    );
  });

  // Ф6: match-DTO чужого сохранённого рецепта с кастомной строкой ПРИХОДИТ сюда
  // уже с userCustomIngredientId=null (гейт владения — features/recipes/match-service.ts),
  // так как реальный customId принадлежит автору рецепта, не смотрящему. §3.3
  // обязана собрать те же name-only ссылки, что и П3 (без customId в hrefs).
  it("Ф6: a foreign saved recipe's custom-ingredient gap arrives customId-nulled and gets name-only hrefs", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (listSavedRecipes as Mock).mockResolvedValue([savedRef("r-foreign-custom", "foreign-custom-slug", "Чужой рецепт с кастомным ингредиентом")]);
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-foreign-custom": matchDto("r-foreign-custom", [
        ...Array.from({ length: 8 }, (_, i) => coveredLine({ recipeIngredientId: `cov-${i}` })),
        missingLine({
          recipeIngredientId: "miss-foreign-custom",
          ingredientDisplayName: "Особый солод автора",
          category: "fermentable",
          ingredientCatalogItemId: null,
          // Гейт владения уже отработал ВЫШЕ по стеку (match-service): чужой FK
          // сюда никогда не долетает — здесь он null, как и при полном отсутствии
          // привязки.
          userCustomIngredientId: null,
          suggestedAddQuantity: 500,
          suggestedAddUnit: "g"
        })
      ])
    });

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    expect(dto.opportunities).toHaveLength(1);
    const line = dto.opportunities[0].lines[0];
    // Ни каталожная, ни кастомная ссылка — только name-only фолбэк (поиск по
    // каталогу + deeplink «Добавить свой» с именем/количеством/категорией).
    expect(line.catalogHref).toBe("/catalog?q=%D0%9E%D1%81%D0%BE%D0%B1%D1%8B%D0%B9%20%D1%81%D0%BE%D0%BB%D0%BE%D0%B4%20%D0%B0%D0%B2%D1%82%D0%BE%D1%80%D0%B0");
    expect(line.addToStockHref).toBe(
      "/app/ingredients?addName=%D0%9E%D1%81%D0%BE%D0%B1%D1%8B%D0%B9%20%D1%81%D0%BE%D0%BB%D0%BE%D0%B4%20%D0%B0%D0%B2%D1%82%D0%BE%D1%80%D0%B0&addQty=500&addUnit=g&addCategory=fermentable"
    );
    expect(line.catalogHref).not.toContain("/catalog/custom/");
  });

  it("FIX-4(а): excludes ALL versions of a family when any version sits behind a planned brew", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([
      plannedBatch({ recipeId: "r-v2", recipeTitle: "IPA v2" })
    ]);
    (listSavedRecipes as Mock).mockResolvedValue([]);
    (listOwnRecipeRefs as Mock).mockResolvedValue({
      // listOwnRecipeRefs схлопывает до последней версии — r-v3, а не r-v2.
      refs: [ownRef("r-v3", "ipa-v3-slug", "IPA v3")],
      familyIdByVersionId: new Map([
        ["r-v1", "fam-ipa"],
        ["r-v2", "fam-ipa"],
        ["r-v3", "fam-ipa"]
      ])
    });
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-v2", [missingLine()])
    });

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    // Без FIX-4(а) r-v3 (последняя версия того же семейства) вошла бы в §3.3
    // как дубль сущности, уже показанной в §3.2 варкой за r-v2.
    expect(dto.opportunities).toEqual([]);
    expect(computeRecipeMatchesForUser).not.toHaveBeenCalled();
    expect(computeRecipeMatchesForBrewBatches).toHaveBeenCalledWith({
      userId: "u-1",
      batches: [{ brewBatchId: "bb-1", recipeId: "r-v2" }]
    });
  });

  it("FIX-4(б): a favorited old version of the user's own family doesn't duplicate the own latest version", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (listSavedRecipes as Mock).mockResolvedValue([savedRef("r-v1", "ipa-v1-slug", "IPA v1")]);
    (listOwnRecipeRefs as Mock).mockResolvedValue({
      refs: [ownRef("r-v3", "ipa-v3-slug", "IPA v3")],
      familyIdByVersionId: new Map([
        ["r-v1", "fam-ipa"],
        ["r-v2", "fam-ipa"],
        ["r-v3", "fam-ipa"]
      ])
    });
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-v3": nearMissMatch("r-v3", 1)
    });

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    // Без FIX-4(б) r-v1 (избранная старая версия своего же рецепта) и r-v3
    // (свой актуальный кандидат) появились бы как два разных "рецепта".
    expect(dto.opportunities).toHaveLength(1);
    expect(dto.opportunities[0].recipeId).toBe("r-v3");
    const call = (computeRecipeMatchesForUser as Mock).mock.calls[0][0];
    expect(call.recipeIds).toEqual(["r-v3"]);
  });
});

describe("buildShoppingListForUser — FIX-2: includeOpportunities gate", () => {
  it("defaults to false: recipe listings for §3.3 are never fetched, opportunities stay empty", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ recipeId: "r-1" })]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [missingLine()])
    });

    const dtoDefault = await buildShoppingListForUser("u-1");
    const dtoExplicitFalse = await buildShoppingListForUser("u-1", { includeOpportunities: false });

    for (const dto of [dtoDefault, dtoExplicitFalse]) {
      expect(dto.opportunities).toEqual([]);
      expect(dto.collapsedOpportunityCount).toBe(0);
      // §3.2 продолжает работать как обычно — гейт затрагивает только §3.3.
      expect(dto.totalItems).toBe(1);
    }
    expect(listSavedRecipes).not.toHaveBeenCalled();
    expect(listOwnRecipeRefs).not.toHaveBeenCalled();
  });
});

describe("buildShoppingListForUser — пустые состояния (§3.4)", () => {
  it("nothing_to_do: no planned brews and no opportunities", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);

    const dto = await buildShoppingListForUser("u-1");

    expect(dto.emptyReason).toBe("nothing_to_do");
    expect(dto.groups).toEqual([]);
    expect(dto.opportunities).toEqual([]);
    expect(computeRecipeMatchesForUser).not.toHaveBeenCalled();
    expect(computeRecipeMatchesForBrewBatches).not.toHaveBeenCalled();
  });

  it("null (opportunities-only): no planned brews but favorites have near-misses", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (listSavedRecipes as Mock).mockResolvedValue([savedRef("r-1", "r-1-slug", "Избранный рецепт")]);
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-1": nearMissMatch("r-1", 1)
    });

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    expect(dto.emptyReason).toBeNull();
    expect(dto.groups).toEqual([]);
    expect(dto.opportunities).toHaveLength(1);
  });

  it("all_in_stock: planned brews exist but nothing is missing, regardless of opportunities", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ recipeId: "r-1" })]);
    (listSavedRecipes as Mock).mockResolvedValue([savedRef("r-2", "r-2-slug", "Избранный")]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [coveredLine()], { missingCount: 0 })
    });
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-2": nearMissMatch("r-2", 1)
    });

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    expect(dto.emptyReason).toBe("all_in_stock");
    expect(dto.groups).toEqual([]);
    // возможности остаются видны даже когда агрегированная секция пуста
    expect(dto.opportunities).toHaveLength(1);
  });

  it("null (full layout): planned brews with missing items", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ recipeId: "r-1" })]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [missingLine()])
    });

    const dto = await buildShoppingListForUser("u-1");

    expect(dto.emptyReason).toBeNull();
    expect(dto.totalItems).toBe(1);
  });
});

describe("buildShoppingListForUser — П1: ручные позиции («Своё»)", () => {
  it("позиция, привязанная к каталогу, получает hrefs каталога и quantityLabel", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (loadManualItems as Mock).mockResolvedValue([
      manualItemRow({
        id: "mi-1",
        name: "Cascade",
        quantity: 100,
        unit: "g",
        category: "hop",
        ingredientCatalogItemId: "cat-cascade"
      })
    ]);

    const dto = await buildShoppingListForUser("u-1");

    expect(dto.manualItems).toHaveLength(1);
    const item = dto.manualItems[0];
    expect(item.catalogHref).toBe("/catalog/system/cat-cascade");
    expect(item.addToStockHref).toBe("/app/ingredients?addSource=catalog&addId=cat-cascade&addQty=100&addUnit=g");
    expect(item.quantityLabel).toBe("100 г");
    expect(item.hasStockLinkage).toBe(true);
    expect(item.checked).toBe(false);
  });

  it("позиция без привязки — name-фолбэк на поиск/добавление и quantityLabel null без количества", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (loadManualItems as Mock).mockResolvedValue([
      manualItemRow({ id: "mi-2", name: "Кроненпробки" })
    ]);

    const dto = await buildShoppingListForUser("u-1");

    const item = dto.manualItems[0];
    expect(item.catalogHref).toBe("/catalog?q=%D0%9A%D1%80%D0%BE%D0%BD%D0%B5%D0%BD%D0%BF%D1%80%D0%BE%D0%B1%D0%BA%D0%B8");
    expect(item.addToStockHref).toBe("/app/ingredients?addName=%D0%9A%D1%80%D0%BE%D0%BD%D0%B5%D0%BD%D0%BF%D1%80%D0%BE%D0%B1%D0%BA%D0%B8");
    expect(item.quantityLabel).toBeNull();
    expect(item.hasStockLinkage).toBe(false);
  });

  it("mapManualItemToDto: битая единица в БД (не входит в inventoryUnits) — пара количество/единица трактуется как отсутствующая", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (loadManualItems as Mock).mockResolvedValue([
      // "коробка" — устаревший/ручной алиас в БД, не входит в inventoryUnits.
      manualItemRow({ id: "mi-3", name: "Солод про запас", quantity: 5, unit: "коробка" })
    ]);

    const dto = await buildShoppingListForUser("u-1");

    const item = dto.manualItems[0];
    expect(item.quantity).toBeNull();
    expect(item.unit).toBeNull();
    expect(item.quantityLabel).toBeNull();
  });

  it("totalItems учитывает неотмеченные ручные позиции — отмеченная («куплено») в счётчик не входит", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (loadManualItems as Mock).mockResolvedValue([
      manualItemRow({ id: "mi-1", name: "A" }),
      manualItemRow({ id: "mi-2", name: "B", checkedAt: new Date("2026-01-02") })
    ]);

    const dto = await buildShoppingListForUser("u-1");

    expect(dto.totalItems).toBe(1);
    expect(dto.manualItems.find((item) => item.id === "mi-1")?.checked).toBe(false);
    expect(dto.manualItems.find((item) => item.id === "mi-2")?.checked).toBe(true);
  });

  it("nothing_to_do не ставится, если есть хотя бы одна ручная позиция (даже без варок и возможностей)", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (loadManualItems as Mock).mockResolvedValue([manualItemRow()]);

    const dto = await buildShoppingListForUser("u-1");

    expect(dto.emptyReason).toBeNull();
    expect(dto.manualItems).toHaveLength(1);
  });

  it("all_in_stock не ломается ручными позициями — статус сохраняется, manualItems приложены рядом", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ recipeId: "r-1" })]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [coveredLine()], { missingCount: 0 })
    });
    (loadManualItems as Mock).mockResolvedValue([manualItemRow({ id: "mi-1", name: "Star San" })]);

    const dto = await buildShoppingListForUser("u-1");

    expect(dto.emptyReason).toBe("all_in_stock");
    expect(dto.groups).toEqual([]);
    expect(dto.manualItems).toHaveLength(1);
    // отмеченная не в счету totalItems, а тут позиция неотмеченная -> считается
    expect(dto.totalItems).toBe(1);
  });

  it("дашборд-вызов (без options, includeOpportunities не передан) тоже получает ручные позиции", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (loadManualItems as Mock).mockResolvedValue([manualItemRow({ id: "mi-1", name: "Star San" })]);

    const dto = await buildShoppingListForUser("u-1");

    expect(loadManualItems).toHaveBeenCalledWith("u-1");
    expect(dto.manualItems).toHaveLength(1);
    expect(dto.manualItems[0].name).toBe("Star San");
  });
});

describe("buildShoppingListForUser — П2: отметка «куплено» + checkedCount", () => {
  it("join по ключу: отмеченная в shopping_line_checks строка приходит с checked=true, hasStockLinkage=true при привязке", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ id: "bb-1", recipeId: "r-1" })]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [missingLine({ ingredientCatalogItemId: "cat-citra", suggestedAddUnit: "g" })])
    });
    // Ключ строки — resolveLineKey: "catalog:<id>|<unit>".
    (loadLineChecks as Mock).mockResolvedValue(new Set(["catalog:cat-citra|g"]));

    const dto = await buildShoppingListForUser("u-1");

    const line = dto.groups.flatMap((group) => group.items)[0];
    expect(line.checked).toBe(true);
    expect(line.hasStockLinkage).toBe(true);
  });

  it("строка без каталожной/кастомной привязки — hasStockLinkage=false даже если отмечена", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ id: "bb-1", recipeId: "r-1" })]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [
        missingLine({
          ingredientDisplayName: "Ирландский мох",
          ingredientCatalogItemId: null,
          userCustomIngredientId: null,
          suggestedAddUnit: "g"
        })
      ])
    });
    (loadLineChecks as Mock).mockResolvedValue(new Set(["name:ирландский мох|g"]));

    const dto = await buildShoppingListForUser("u-1");

    const line = dto.groups.flatMap((group) => group.items)[0];
    expect(line.checked).toBe(true);
    expect(line.hasStockLinkage).toBe(false);
  });

  it("непустые отметки → ленивая чистка вызывается с текущими живыми ключами", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ id: "bb-1", recipeId: "r-1" })]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [missingLine({ ingredientCatalogItemId: "cat-citra", suggestedAddUnit: "g" })])
    });
    // Отметка на ключ, который в текущей агрегации уже не существует (сирота) —
    // pruneOrphanLineChecks должен получить только живые ключи.
    (loadLineChecks as Mock).mockResolvedValue(new Set(["catalog:cat-stale|g"]));

    await buildShoppingListForUser("u-1");

    expect(pruneOrphanLineChecks).toHaveBeenCalledTimes(1);
    expect(pruneOrphanLineChecks).toHaveBeenCalledWith("u-1", ["catalog:cat-citra|g"]);
  });

  it("пустые отметки → ленивая чистка НЕ вызывается (нечего чистить)", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ id: "bb-1", recipeId: "r-1" })]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [missingLine()])
    });
    (loadLineChecks as Mock).mockResolvedValue(new Set());

    await buildShoppingListForUser("u-1");

    expect(pruneOrphanLineChecks).not.toHaveBeenCalled();
  });

  it("отметки есть, но агрегация пустая (нет запланированных варок) → ленивая чистка вызывается с пустым списком живых ключей", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([]);
    (loadLineChecks as Mock).mockResolvedValue(new Set(["catalog:cat-old|g"]));

    await buildShoppingListForUser("u-1");

    expect(pruneOrphanLineChecks).toHaveBeenCalledTimes(1);
    expect(pruneOrphanLineChecks).toHaveBeenCalledWith("u-1", []);
  });

  it("totalItems/checkedCount на смешанной фикстуре: 2 производные (1 отмечена) + 2 ручные (1 отмечена) → totalItems 2, checkedCount 2", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ id: "bb-1", recipeId: "r-1" })]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [
        missingLine({
          recipeIngredientId: "ri-hop",
          ingredientDisplayName: "Citra",
          ingredientCatalogItemId: "cat-citra",
          suggestedAddUnit: "g"
        }),
        missingLine({
          recipeIngredientId: "ri-yeast",
          ingredientDisplayName: "US-05",
          ingredientCatalogItemId: "cat-us05",
          userCustomIngredientId: null,
          category: "yeast",
          suggestedAddQuantity: 1,
          suggestedAddUnit: "pack"
        })
      ])
    });
    // Только строка Citra отмечена «куплено».
    (loadLineChecks as Mock).mockResolvedValue(new Set(["catalog:cat-citra|g"]));
    (loadManualItems as Mock).mockResolvedValue([
      manualItemRow({ id: "mi-1", name: "Дезинфектант" }),
      manualItemRow({ id: "mi-2", name: "Кроненпробки", checkedAt: new Date("2026-01-02") })
    ]);

    const dto = await buildShoppingListForUser("u-1");

    expect(dto.totalItems).toBe(2);
    expect(dto.checkedCount).toBe(2);
  });
});

describe("buildShoppingListForUser — П4: округление до покупабельных фасовок", () => {
  it("нехватка 37 г при вариантах 50/100 г (default 50) → packSuggestion «пачка 50 г», addToStockHref предзаполнен 50 г (не 37)", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ id: "bb-1", recipeId: "r-1" })]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [
        missingLine({ ingredientCatalogItemId: "cat-citra", suggestedAddQuantity: 37, suggestedAddUnit: "g" })
      ])
    });
    (loadPackVariantsByCatalogIds as Mock).mockResolvedValue([
      packVariantRow({ id: "pv-50", stockContentAmount: 50, isDefaultForStock: true, position: 0 }),
      packVariantRow({ id: "pv-100", stockContentAmount: 100, isDefaultForStock: false, position: 1 })
    ]);

    const dto = await buildShoppingListForUser("u-1");

    const line = dto.groups.flatMap((group) => group.items)[0];
    // Исходная нехватка не меняется — это отдельное от фасовки поле.
    expect(line.quantityToBuy).toBe(37);
    expect(line.quantityLabel).toBe("37 г");
    expect(line.packSuggestion).toEqual({ label: "пачка 50 г", totalQuantity: 50, totalUnit: "g" });
    expect(line.addToStockHref).toContain("addQty=50");
    expect(line.addToStockHref).not.toContain("addQty=37");
    expect(loadPackVariantsByCatalogIds).toHaveBeenCalledWith(["cat-citra"]);
  });

  it("строка без каталожной привязки: её id не попадает в батч-запрос вариантов, packSuggestion null", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ id: "bb-1", recipeId: "r-1" })]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [
        missingLine({
          ingredientDisplayName: "Кориандр молотый",
          ingredientCatalogItemId: null,
          userCustomIngredientId: null,
          suggestedAddQuantity: 10,
          suggestedAddUnit: "g"
        })
      ])
    });

    const dto = await buildShoppingListForUser("u-1");

    const line = dto.groups.flatMap((group) => group.items)[0];
    expect(line.packSuggestion).toBeNull();
    expect(loadPackVariantsByCatalogIds).toHaveBeenCalledWith([]);
    // href остаётся расчётной нехваткой, как раньше (без П4).
    expect(line.addToStockHref).toContain("addQty=10");
  });

  it("каталожная строка без вариантов фасовки в БД — packSuggestion null, href как сегодня (исходная нехватка)", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ id: "bb-1", recipeId: "r-1" })]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [
        missingLine({ ingredientCatalogItemId: "cat-no-variants", suggestedAddQuantity: 37, suggestedAddUnit: "g" })
      ])
    });
    (loadPackVariantsByCatalogIds as Mock).mockResolvedValue([]);

    const dto = await buildShoppingListForUser("u-1");

    const line = dto.groups.flatMap((group) => group.items)[0];
    expect(line.packSuggestion).toBeNull();
    expect(line.addToStockHref).toContain("addQty=37");
  });

  it("нехватка 120 г при default-фасовке 100 г → «2 пачки по 100 г», href предзаполнен 200 г", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ id: "bb-1", recipeId: "r-1" })]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [
        missingLine({ ingredientCatalogItemId: "cat-citra", suggestedAddQuantity: 120, suggestedAddUnit: "g" })
      ])
    });
    (loadPackVariantsByCatalogIds as Mock).mockResolvedValue([
      packVariantRow({ id: "pv-100", stockContentAmount: 100, isDefaultForStock: true, position: 0 })
    ]);

    const dto = await buildShoppingListForUser("u-1");

    const line = dto.groups.flatMap((group) => group.items)[0];
    expect(line.packSuggestion).toEqual({ label: "2 пачки по 100 г", totalQuantity: 200, totalUnit: "g" });
    expect(line.addToStockHref).toContain("addQty=200");
  });

  it("дрожжи «1 пачка» (count-размерность) не задеты П4 — packSuggestion всегда null", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ id: "bb-1", recipeId: "r-1" })]);
    (computeRecipeMatchesForBrewBatches as Mock).mockResolvedValue({
      "bb-1": matchDto("r-1", [
        missingLine({
          ingredientDisplayName: "US-05",
          category: "yeast",
          ingredientCatalogItemId: "cat-us05",
          suggestedAddQuantity: 1,
          suggestedAddUnit: "pack"
        })
      ])
    });
    (loadPackVariantsByCatalogIds as Mock).mockResolvedValue([
      packVariantRow({ id: "pv-pack", ingredientId: "cat-us05", stockContentAmount: 1, stockContentUnit: "pack", isDefaultForStock: true })
    ]);

    const dto = await buildShoppingListForUser("u-1");

    const line = dto.groups.flatMap((group) => group.items)[0];
    expect(line.packSuggestion).toBeNull();
  });
});
