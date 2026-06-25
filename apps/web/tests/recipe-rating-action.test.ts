import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  rateRecipe: vi.fn(),
  deleteRecipeRating: vi.fn(),
  getViewerRecipeRatingState: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/features/recipes/service", () => ({
  rateRecipe: mocks.rateRecipe,
  deleteRecipeRating: mocks.deleteRecipeRating,
  getViewerRecipeRatingState: mocks.getViewerRecipeRatingState
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  deleteRecipeRatingAction,
  loadRecipeRatingViewerState,
  rateRecipeAction
} from "../app/(public)/recipes/[slug]/actions";

const input = { recipeId: "r-1", slug: "hazy-ipa", stars: 4 };

beforeEach(() => {
  mocks.getSessionUser.mockReset();
  mocks.rateRecipe.mockReset();
  mocks.deleteRecipeRating.mockReset();
  mocks.getViewerRecipeRatingState.mockReset();
  mocks.revalidatePath.mockReset();
});

describe("rateRecipeAction", () => {
  it("returns AUTH and does not touch the service when not signed in", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const result = await rateRecipeAction(input);

    expect(result).toEqual({ ok: false, code: "AUTH", message: expect.any(String) });
    expect(mocks.rateRecipe).not.toHaveBeenCalled();
  });

  it("takes userId only from the server session, not the client payload", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "server-user" });
    mocks.rateRecipe.mockResolvedValue({ average: 4, count: 1 });

    // even if a client tried to inject userId, the action ignores it
    await rateRecipeAction({ ...input, userId: "attacker" } as never);

    expect(mocks.rateRecipe).toHaveBeenCalledWith("server-user", "r-1", { stars: 4, body: null });
  });

  it("revalidates both the detail page and the listing on success", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "u-1" });
    mocks.rateRecipe.mockResolvedValue({ average: 4, count: 1 });

    const result = await rateRecipeAction(input);

    expect(result).toEqual({ ok: true, rating: { average: 4, count: 1 } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/recipes/hazy-ipa");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/recipes");
  });

  it("maps OWN_RECIPE to a friendly code", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "u-1" });
    mocks.rateRecipe.mockRejectedValue(new Error("OWN_RECIPE"));

    const result = await rateRecipeAction(input);
    expect(result).toEqual({ ok: false, code: "OWN_RECIPE", message: expect.any(String) });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps NOT_FOUND/FORBIDDEN to NOT_FOUND", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "u-1" });
    mocks.rateRecipe.mockRejectedValue(new Error("FORBIDDEN"));

    const result = await rateRecipeAction(input);
    expect(result).toEqual({ ok: false, code: "NOT_FOUND", message: expect.any(String) });
  });
});

describe("deleteRecipeRatingAction", () => {
  it("requires auth", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    const result = await deleteRecipeRatingAction({ recipeId: "r-1", slug: "hazy-ipa" });
    expect(result).toEqual({ ok: false, code: "AUTH", message: expect.any(String) });
    expect(mocks.deleteRecipeRating).not.toHaveBeenCalled();
  });

  it("deletes and revalidates on success", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "u-1" });
    mocks.deleteRecipeRating.mockResolvedValue({ average: 0, count: 0 });

    const result = await deleteRecipeRatingAction({ recipeId: "r-1", slug: "hazy-ipa" });

    expect(result).toEqual({ ok: true, rating: { average: 0, count: 0 } });
    expect(mocks.deleteRecipeRating).toHaveBeenCalledWith("u-1", "r-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/recipes");
  });
});

describe("loadRecipeRatingViewerState", () => {
  it("returns an unauthenticated state without touching the service when not signed in", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const result = await loadRecipeRatingViewerState("r-1");

    expect(result).toEqual({ authenticated: false, canRate: false, rating: null });
    expect(mocks.getViewerRecipeRatingState).not.toHaveBeenCalled();
  });

  it("returns the service viewer state for a signed-in user (userId only from session)", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "viewer-1" });
    mocks.getViewerRecipeRatingState.mockResolvedValue({ canRate: true, rating: { stars: 3, body: null } });

    const result = await loadRecipeRatingViewerState("r-1");

    expect(mocks.getViewerRecipeRatingState).toHaveBeenCalledWith("viewer-1", "r-1");
    expect(result).toEqual({ authenticated: true, canRate: true, rating: { stars: 3, body: null } });
  });
});
