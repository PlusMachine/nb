import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireUser: vi.fn(async () => ({ id: "u-1" })),
  updateInventoryQuantity: vi.fn(async () => ({}))
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("../lib/auth", () => ({
  requireUser: mocks.requireUser
}));

vi.mock("../features/inventory/service", async () => {
  const actual = await vi.importActual<typeof import("../features/inventory/service")>("../features/inventory/service");
  return {
    ...actual,
    updateInventoryQuantity: mocks.updateInventoryQuantity
  };
});

import { updateInventoryInlineAction } from "../app/(app)/app/ingredients/actions";

describe("inventory inline actions", () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset();
    mocks.requireUser.mockClear();
    mocks.updateInventoryQuantity.mockReset();
    mocks.updateInventoryQuantity.mockResolvedValue({ id: "inv-1" });
  });

  it("updates quantity and revalidates page", async () => {
    const result = await updateInventoryInlineAction({
      inventoryItemId: "inv-1",
      enteredQuantity: "3",
      enteredUnit: "kg"
    });

    expect(result.ok).toBe(true);
    expect(mocks.updateInventoryQuantity).toHaveBeenCalledWith("u-1", "inv-1", {
      enteredQuantity: 3,
      enteredUnit: "kg"
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/ingredients");
  });

  it("rejects invalid quantity", async () => {
    const result = await updateInventoryInlineAction({
      inventoryItemId: "inv-1",
      enteredQuantity: "0",
      enteredUnit: "kg"
    });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.enteredQuantity).toBeDefined();
    expect(mocks.updateInventoryQuantity).not.toHaveBeenCalled();
  });

  it("rejects invalid unit", async () => {
    const result = await updateInventoryInlineAction({
      inventoryItemId: "inv-1",
      enteredQuantity: "1",
      enteredUnit: "stone"
    });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.enteredUnit).toBeDefined();
    expect(mocks.updateInventoryQuantity).not.toHaveBeenCalled();
  });
});
