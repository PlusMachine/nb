import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  items: new Map<string, { id: string; status: string; attributes: Record<string, unknown> }>(),
  updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  deleted: [] as string[],
  updateBehaviour: new Map<string, "ok" | "missing" | "invalid" | "throw">(),
  deleteBehaviour: new Map<string, "deleted" | "archived" | "missing" | "throw">()
}));

vi.mock("../features/ingredients/service", () => ({
  getIngredientById: async (id: string) => mocks.items.get(id) ?? null,
  updateIngredient: async (id: string, patch: Record<string, unknown>) => {
    const behaviour = mocks.updateBehaviour.get(id) ?? "ok";
    if (behaviour === "missing") {
      return null;
    }
    if (behaviour === "invalid") {
      z.object({ isActive: z.string() }).parse(patch);
    }
    if (behaviour === "throw") {
      throw new Error("BOOM");
    }
    mocks.updates.push({ id, patch });
    return mocks.items.get(id);
  },
  deleteIngredient: async (id: string) => {
    const behaviour = mocks.deleteBehaviour.get(id) ?? "deleted";
    if (behaviour === "missing") {
      return null;
    }
    if (behaviour === "throw") {
      throw new Error("BOOM");
    }
    mocks.deleted.push(id);
    return { id, displayName: id, archived: behaviour === "archived" };
  }
}));

import {
  archiveCatalogIngredients,
  deleteCatalogIngredients,
  normalizeBulkIds
} from "../features/ingredients/admin-bulk";
import {
  describeCatalogBulkFailures,
  groupCatalogBulkFailures
} from "../features/ingredients/admin-page-model";

beforeEach(() => {
  mocks.items.clear();
  mocks.updates = [];
  mocks.deleted = [];
  mocks.updateBehaviour.clear();
  mocks.deleteBehaviour.clear();
});

describe("normalizeBulkIds", () => {
  it("trims, drops empties and deduplicates", () => {
    expect(normalizeBulkIds([" a ", "a", "", "b"])).toEqual(["a", "b"]);
  });

  it("caps the batch size", () => {
    const ids = Array.from({ length: 250 }, (_, index) => `id-${index}`);
    expect(normalizeBulkIds(ids)).toHaveLength(200);
  });
});

describe("archiveCatalogIngredients", () => {
  it("deactivates the card and drops the draft marker that would outrank isActive", async () => {
    mocks.items.set("draft-1", {
      id: "draft-1",
      status: "draft",
      attributes: { _catalog_status: "draft", alpha_acid_pct_typical: 5 }
    });

    const result = await archiveCatalogIngredients(["draft-1"], "admin-1");

    expect(result).toEqual({ archivedIds: ["draft-1"], failures: [] });
    expect(mocks.updates).toEqual([{
      id: "draft-1",
      patch: { isActive: false, attributes: { alpha_acid_pct_typical: 5 } }
    }]);
  });

  it("reports a reason for every card it could not archive", async () => {
    mocks.items.set("merged-1", { id: "merged-1", status: "merged", attributes: {} });
    mocks.items.set("broken-1", { id: "broken-1", status: "active", attributes: {} });
    mocks.items.set("gone-1", { id: "gone-1", status: "active", attributes: {} });
    mocks.items.set("bad-1", { id: "bad-1", status: "active", attributes: {} });
    mocks.updateBehaviour.set("broken-1", "throw");
    mocks.updateBehaviour.set("gone-1", "missing");
    mocks.updateBehaviour.set("bad-1", "invalid");

    const result = await archiveCatalogIngredients(
      ["merged-1", "ghost-1", "broken-1", "gone-1", "bad-1"],
      "admin-1"
    );

    expect(result.archivedIds).toEqual([]);
    expect(result.failures).toEqual([
      { id: "merged-1", reason: "merged" },
      { id: "ghost-1", reason: "missing" },
      { id: "broken-1", reason: "failed" },
      { id: "gone-1", reason: "missing" },
      { id: "bad-1", reason: "invalid" }
    ]);
    expect(mocks.updates).toEqual([]);
  });

  it("keeps the successful part when only some cards fail", async () => {
    mocks.items.set("active-1", { id: "active-1", status: "active", attributes: {} });
    mocks.items.set("merged-1", { id: "merged-1", status: "merged", attributes: {} });

    const result = await archiveCatalogIngredients(["active-1", "merged-1"], "admin-1");

    expect(result.archivedIds).toEqual(["active-1"]);
    expect(result.failures).toEqual([{ id: "merged-1", reason: "merged" }]);
  });
});

describe("deleteCatalogIngredients", () => {
  it("splits the batch into deleted, archived and failed", async () => {
    mocks.deleteBehaviour.set("used-1", "archived");
    mocks.deleteBehaviour.set("ghost-1", "missing");
    mocks.deleteBehaviour.set("broken-1", "throw");

    const result = await deleteCatalogIngredients(
      ["free-1", "used-1", "ghost-1", "broken-1"],
      "admin-1"
    );

    expect(result).toEqual({
      deletedIds: ["free-1"],
      archivedIds: ["used-1"],
      failures: [
        { id: "ghost-1", reason: "missing" },
        { id: "broken-1", reason: "failed" }
      ]
    });
  });
});

describe("groupCatalogBulkFailures", () => {
  it("groups failures by reason and describes them for the operator", () => {
    const grouped = groupCatalogBulkFailures([
      { id: "a", reason: "missing" },
      { id: "b", reason: "merged" },
      { id: "c", reason: "missing" }
    ]);

    expect(grouped).toEqual([
      { reason: "merged", ids: ["b"] },
      { reason: "missing", ids: ["a", "c"] }
    ]);
    expect(describeCatalogBulkFailures(grouped)).toBe("объединённые карточки: 1, нет в каталоге: 2");
  });
});
