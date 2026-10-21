import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
  preview: vi.fn(),
  consume: vi.fn(),
  revalidate: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.user }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/features/brew-batches/service", () => ({
  updateBrewBatchStatus: mocks.update,
  deleteBrewBatch: mocks.remove
}));
vi.mock("@/features/brew-batches/inventory", () => ({ restoreBrewBatchInventory: mocks.restore, previewBrewBatchConsumption: mocks.preview, consumeBrewBatchInventory: mocks.consume }));
vi.mock("@/features/devices/fermenter-binding", () => ({ bindBatchFermenter: vi.fn() }));

import {
  deleteBrewBatchAction,
  previewBrewBatchInventoryAction,
  consumeBrewBatchInventoryAction,
  restoreBrewBatchInventoryAction,
  setBrewBatchStatusAction
} from "../app/(app)/app/brew-batches/[id]/actions";

describe("batch lifecycle preserves physical stock", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ id: "owner" });
    mocks.restore.mockResolvedValue({ view: {}, restoredItemCount: 2 });
  });

  it("cancelling a batch does not restore already used ingredients", async () => {
    expect(await setBrewBatchStatusAction("batch", "cancelled")).toEqual({ ok: true, message: "Статус обновлён." });
    expect(mocks.update).toHaveBeenCalledWith("owner", "batch", "cancelled");
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it("deleting a batch preserves its consumption", async () => {
    expect(await deleteBrewBatchAction("batch")).toEqual({ ok: true, message: "Партия удалена." });
    expect(mocks.remove).toHaveBeenCalledWith("owner", "batch");
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it("still supports an explicit return before deletion", async () => {
    expect((await restoreBrewBatchInventoryAction("batch")).ok).toBe(true);
    expect(mocks.restore).toHaveBeenCalledExactlyOnceWith("owner", "batch");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not report successful deletion when ownership lookup fails", async () => {
    mocks.remove.mockRejectedValue(new Error("NOT_FOUND"));
    expect((await deleteBrewBatchAction("foreign-batch")).ok).toBe(false);
    expect(mocks.restore).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("requires authentication before either lifecycle change", async () => {
    mocks.user.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await deleteBrewBatchAction("batch")).ok).toBe(false);
    expect((await setBrewBatchStatusAction("batch", "cancelled")).ok).toBe(false);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it("explains unavailable legacy composition before preview or consumption", async () => {
    mocks.preview.mockRejectedValue(new Error("BATCH_INVENTORY_SNAPSHOT_REQUIRED"));
    mocks.consume.mockRejectedValue(new Error("BATCH_INVENTORY_SNAPSHOT_REQUIRED"));
    for (const action of [previewBrewBatchInventoryAction, consumeBrewBatchInventoryAction]) {
      const result = await action("legacy-batch");
      expect(result.ok).toBe(false);
      expect(result.message).toContain("не сохранён полный состав");
      expect(result.message).toContain("вручную на складе");
    }
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

});
