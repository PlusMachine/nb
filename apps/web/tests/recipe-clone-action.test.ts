import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  cloneRecipeFromPublic: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/features/recipes/service", () => ({ cloneRecipeFromPublic: mocks.cloneRecipeFromPublic }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { cloneRecipeFromPublicAction } from "../app/(public)/recipes/[slug]/clone-actions";

const RECIPE_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  mocks.getSessionUser.mockReset();
  mocks.cloneRecipeFromPublic.mockReset();
  mocks.revalidatePath.mockReset();
});

describe("cloneRecipeFromPublicAction", () => {
  it("returns AUTH and does not touch the service when not signed in", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const result = await cloneRecipeFromPublicAction({ recipeId: RECIPE_ID });

    expect(result).toEqual({ ok: false, code: "AUTH", message: expect.any(String) });
    expect(mocks.cloneRecipeFromPublic).not.toHaveBeenCalled();
  });

  it("takes userId only from the server session, never the client payload", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "server-user" });
    mocks.cloneRecipeFromPublic.mockResolvedValue({ id: "new-recipe" });

    // even if a client tried to inject userId, the action ignores it
    await cloneRecipeFromPublicAction({ recipeId: RECIPE_ID, userId: "attacker" } as never);

    expect(mocks.cloneRecipeFromPublic).toHaveBeenCalledWith("server-user", RECIPE_ID, { targetBatchVolumeLitres: null });
  });

  it("passes a valid targetBatchVolumeLitres through to the service (clone-at-volume, #6b)", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "u-1" });
    mocks.cloneRecipeFromPublic.mockResolvedValue({ id: "new-recipe" });

    await cloneRecipeFromPublicAction({ recipeId: RECIPE_ID, targetBatchVolumeLitres: 30 });

    expect(mocks.cloneRecipeFromPublic).toHaveBeenCalledWith("u-1", RECIPE_ID, { targetBatchVolumeLitres: 30 });
  });

  it("drops a non-positive targetBatchVolumeLitres instead of forwarding garbage", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "u-1" });
    mocks.cloneRecipeFromPublic.mockResolvedValue({ id: "new-recipe" });

    const result = await cloneRecipeFromPublicAction({ recipeId: RECIPE_ID, targetBatchVolumeLitres: -5 });

    expect(result).toEqual({ ok: false, code: "NOT_FOUND", message: expect.any(String) });
    expect(mocks.cloneRecipeFromPublic).not.toHaveBeenCalled();
  });

  it("clones and revalidates the workspace listing on success", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "u-1" });
    mocks.cloneRecipeFromPublic.mockResolvedValue({ id: "new-recipe" });

    const result = await cloneRecipeFromPublicAction({ recipeId: RECIPE_ID });

    expect(result).toEqual({ ok: true, recipeId: "new-recipe" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/recipes");
  });

  it("rejects a non-uuid recipeId before touching the service", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "u-1" });

    const result = await cloneRecipeFromPublicAction({ recipeId: "not-a-uuid" });

    expect(result).toEqual({ ok: false, code: "NOT_FOUND", message: expect.any(String) });
    expect(mocks.cloneRecipeFromPublic).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps a FORBIDDEN guard (cloning a non-published other recipe) to NOT_FOUND", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "u-1" });
    mocks.cloneRecipeFromPublic.mockRejectedValue(new Error("FORBIDDEN"));

    const result = await cloneRecipeFromPublicAction({ recipeId: RECIPE_ID });

    expect(result).toEqual({ ok: false, code: "NOT_FOUND", message: expect.any(String) });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps an unexpected failure to ERROR", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "u-1" });
    mocks.cloneRecipeFromPublic.mockRejectedValue(new Error("BOOM"));

    const result = await cloneRecipeFromPublicAction({ recipeId: RECIPE_ID });

    expect(result).toEqual({ ok: false, code: "ERROR", message: expect.any(String) });
  });
});
