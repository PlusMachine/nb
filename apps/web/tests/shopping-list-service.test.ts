import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";

vi.mock("../features/brew-batches/service", () => ({ listBrewBatchesForUser: vi.fn() }));
vi.mock("../features/recipes/match-service", () => ({ computeRecipeMatchesForUser: vi.fn() }));
vi.mock("../features/recipes/service", () => ({ listSavedRecipes: vi.fn(), listOwnRecipeRefs: vi.fn() }));

import { buildShoppingListForUser } from "../features/shopping/service";
import { listBrewBatchesForUser } from "../features/brew-batches/service";
import { computeRecipeMatchesForUser } from "../features/recipes/match-service";
import { listSavedRecipes, listOwnRecipeRefs } from "../features/recipes/service";
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

beforeEach(() => {
  vi.clearAllMocks();
  (listSavedRecipes as Mock).mockResolvedValue([]);
  (listOwnRecipeRefs as Mock).mockResolvedValue({ refs: [], familyIdByVersionId: new Map<string, string>() });
  (computeRecipeMatchesForUser as Mock).mockResolvedValue({});
});

describe("buildShoppingListForUser — §3.2 агрегация и фикс бага addToStockHref", () => {
  it("regression §1.1: sums quantityToBuy across two brews and rebuilds addToStockHref from the total", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([
      plannedBatch({ id: "bb-1", recipeId: "r-1", recipeTitle: "IPA", name: "Варка 1" }),
      plannedBatch({ id: "bb-2", recipeId: "r-2", recipeTitle: "Stout", name: "Варка 2" })
    ]);
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-1": matchDto("r-1", [missingLine({ suggestedAddQuantity: 30 })]),
      "r-2": matchDto("r-2", [missingLine({ recipeIngredientId: "ri-1b", suggestedAddQuantity: 20 })])
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
    expect(line.neededBy).toEqual([
      { recipeTitle: "IPA", brewName: "Варка 1" },
      { recipeTitle: "Stout", brewName: "Варка 2" }
    ]);
  });

  it("batches the inventory match into a single call for both brews (§1.5)", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([
      plannedBatch({ id: "bb-1", recipeId: "r-1" }),
      plannedBatch({ id: "bb-2", recipeId: "r-2" })
    ]);
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-1": matchDto("r-1", [coveredLine()]),
      "r-2": matchDto("r-2", [coveredLine()])
    });

    await buildShoppingListForUser("u-1");

    expect(computeRecipeMatchesForUser).toHaveBeenCalledTimes(1);
    const call = (computeRecipeMatchesForUser as Mock).mock.calls[0][0];
    expect(call.userId).toBe("u-1");
    expect([...call.recipeIds].sort()).toEqual(["r-1", "r-2"]);
    // Пустой склад не должен молча выключать список покупок.
    expect(call.includeEmptyInventory).toBe(true);
  });

  it("reports a missingCount chip per planned brew, matching the lines it actually contributed", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([
      plannedBatch({ id: "bb-1", recipeId: "r-1", name: "Варка 1" }),
      plannedBatch({ id: "bb-2", recipeId: "r-2", name: "Варка 2" })
    ]);
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-1": matchDto("r-1", [
        missingLine({ ingredientCatalogItemId: "cat-citra" }),
        missingLine({ recipeIngredientId: "ri-yeast", ingredientCatalogItemId: "cat-yeast", ingredientDisplayName: "US-05" })
      ]),
      "r-2": matchDto("r-2", [missingLine({ ingredientCatalogItemId: "cat-citra" })])
    });

    const dto = await buildShoppingListForUser("u-1");

    const brew1 = dto.plannedBrews.find((brew) => brew.brewBatchId === "bb-1");
    const brew2 = dto.plannedBrews.find((brew) => brew.brewBatchId === "bb-2");
    expect(brew1?.missingCount).toBe(2);
    expect(brew2?.missingCount).toBe(1);
  });
});

describe("buildShoppingListForUser — §3.3 «Почти можно сварить»", () => {
  it("excludes a recipe that already sits behind a planned brew (no duplicate with §3.2)", async () => {
    (listBrewBatchesForUser as Mock).mockResolvedValue([plannedBatch({ recipeId: "r-1" })]);
    (listSavedRecipes as Mock).mockResolvedValue([savedRef("r-1", "r-1-slug", "IPA рецепт")]);
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-1": matchDto("r-1", [missingLine()])
    });

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    expect(dto.opportunities).toEqual([]);
    // r-1 не должен фигурировать во втором запросе матча как "кандидат" —
    // он уже участвует как запланированная варка.
    const call = (computeRecipeMatchesForUser as Mock).mock.calls[0][0];
    expect(call.recipeIds).toEqual(["r-1"]);
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
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-v2": matchDto("r-v2", [missingLine()]),
      "r-v3": nearMissMatch("r-v3", 1)
    });

    const dto = await buildShoppingListForUser("u-1", { includeOpportunities: true });

    // Без FIX-4(а) r-v3 (последняя версия того же семейства) вошла бы в §3.3
    // как дубль сущности, уже показанной в §3.2 варкой за r-v2.
    expect(dto.opportunities).toEqual([]);
    const call = (computeRecipeMatchesForUser as Mock).mock.calls[0][0];
    expect(call.recipeIds).toEqual(["r-v2"]);
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
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-1": matchDto("r-1", [missingLine()])
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
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-1": matchDto("r-1", [coveredLine()], { missingCount: 0 }),
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
    (computeRecipeMatchesForUser as Mock).mockResolvedValue({
      "r-1": matchDto("r-1", [missingLine()])
    });

    const dto = await buildShoppingListForUser("u-1");

    expect(dto.emptyReason).toBeNull();
    expect(dto.totalItems).toBe(1);
  });
});
