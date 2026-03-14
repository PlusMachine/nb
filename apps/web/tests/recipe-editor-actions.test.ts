import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "u-1" })),
  createRecipe: vi.fn(),
  updateRecipe: vi.fn(),
  cloneRecipe: vi.fn(),
  previewRecipeDraft: vi.fn(),
  deleteRecipe: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("../features/recipes/service", () => ({
  createRecipe: mocks.createRecipe,
  updateRecipe: mocks.updateRecipe,
  cloneRecipe: mocks.cloneRecipe,
  previewRecipeDraft: mocks.previewRecipeDraft,
  deleteRecipe: mocks.deleteRecipe
}));

describe("recipe editor actions", () => {
  it("create action uses service layer and returns stats payload", async () => {
    mocks.createRecipe.mockResolvedValueOnce({ id: "r-1", og: 1.05, fg: 1.01, abv: 5.3, ibu: 35, color: 11, batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l", ingredients: [] });
    const { createRecipeAction } = await import("../app/(app)/app/recipes/actions");

    const result = await createRecipeAction({
      title: "IPA",
      publicationState: "draft",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l",
      boilTimeMinutes: 60,
      ingredients: []
    });

    expect(mocks.createRecipe).toHaveBeenCalledWith("u-1", expect.objectContaining({ title: "IPA" }));
    expect(result.ok).toBe(true);
    expect(result.recipe?.og).toBe(1.05);
  });

  it("update action uses service layer", async () => {
    mocks.updateRecipe.mockResolvedValueOnce({ id: "r-2", og: 1.06, fg: 1.012, abv: 6, ibu: 40, color: 12, batchSizeEnteredQuantity: 22, batchSizeEnteredUnit: "l", ingredients: [] });
    const { updateRecipeAction } = await import("../app/(app)/app/recipes/actions");

    const result = await updateRecipeAction("r-2", {
      title: "IPA2",
      publicationState: "private",
      batchSizeEnteredQuantity: 22,
      batchSizeEnteredUnit: "l",
      boilTimeMinutes: 60,
      ingredients: []
    });

    expect(mocks.updateRecipe).toHaveBeenCalledWith("u-1", "r-2", expect.objectContaining({ recomputeStats: true }));
    expect(result.ok).toBe(true);
  });

  it("validation errors are surfaced", async () => {
    mocks.createRecipe.mockRejectedValueOnce(new Error("INVALID_UNIT"));
    const { createRecipeAction } = await import("../app/(app)/app/recipes/actions");

    const result = await createRecipeAction({
      title: "Bad",
      publicationState: "draft",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l",
      boilTimeMinutes: 60,
      ingredients: []
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("единицы измерения");
  });

  it("delete action removes recipe and revalidates related pages", async () => {
    mocks.deleteRecipe.mockResolvedValueOnce({ id: "r-3", slug: "ipa-to-delete" });
    const { deleteRecipeAction } = await import("../app/(app)/app/recipes/actions");

    const result = await deleteRecipeAction("r-3");

    expect(result.ok).toBe(true);
    expect(mocks.deleteRecipe).toHaveBeenCalledWith("u-1", "r-3");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/recipes");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/recipes/r-3");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/recipes/r-3/edit");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/recipes");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/recipes/ipa-to-delete");
  });
});
