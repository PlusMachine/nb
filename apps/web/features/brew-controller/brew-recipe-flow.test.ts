import { beforeEach, describe, expect, it, vi } from "vitest";

// Композиция «рецепт → партия → запуск на устройстве» (единый вход «Сварить»,
// автоматическая ветка): createBrewBatchFromRecipe (домен) остаётся нетронут,
// startBrewOnDevice (features/brew-controller/actions.ts) — мокается, чтобы
// проверить именно сшивку, без реального провайдера/БД. messages.ts НЕ
// мокается — тексты должны реально совпадать со словарём.
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createBrewBatchFromRecipe: vi.fn(),
  startBrewOnDevice: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/features/brew-batches/service", () => ({ createBrewBatchFromRecipe: mocks.createBrewBatchFromRecipe }));
vi.mock("./actions", () => ({ startBrewOnDevice: mocks.startBrewOnDevice }));

import { startBrewOnDeviceFromRecipeAction } from "./brew-recipe-flow";

const USER_ID = "u-1";
const RECIPE_ID = "00000000-0000-4000-8000-000000000001";
const DEVICE_ID = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  mocks.requireUser.mockReset();
  mocks.createBrewBatchFromRecipe.mockReset();
  mocks.startBrewOnDevice.mockReset();
  mocks.requireUser.mockResolvedValue({ id: USER_ID });
});

describe("startBrewOnDeviceFromRecipeAction", () => {
  it("создаёт партию из рецепта и честно отражает запущенный нагрев", async () => {
    mocks.createBrewBatchFromRecipe.mockResolvedValue({ id: "batch-1" });
    mocks.startBrewOnDevice.mockResolvedValue({
      ok: true,
      heatingStarted: true,
      status: "brewing",
      externalId: "0",
      slot: 0,
      ack: { ok: true, reason: null },
      reason: null
    });

    const IDEMPOTENCY_KEY = "00000000-0000-4000-8000-0000000000ff";
    const result = await startBrewOnDeviceFromRecipeAction({
      recipeId: RECIPE_ID,
      deviceId: DEVICE_ID,
      idempotencyKey: IDEMPOTENCY_KEY
    });

    expect(result).toEqual({
      ok: true,
      heatingStarted: true,
      brewBatchId: "batch-1",
      message: "Рецепт отправлен, варка запущена.",
      reason: null
    });
    // Ключ идемпотентности проброшен в доменный create (двойной клик → одна партия).
    expect(mocks.createBrewBatchFromRecipe).toHaveBeenCalledWith(USER_ID, RECIPE_ID, {
      idempotencyKey: IDEMPOTENCY_KEY
    });
    expect(mocks.startBrewOnDevice).toHaveBeenCalledWith({
      userId: USER_ID,
      brewBatchId: "batch-1",
      deviceId: DEVICE_ID
    });
  });

  it("REMOTE_DISABLED: партия создана и id не теряется, но не уходит молча (heatingStarted=false)", async () => {
    mocks.createBrewBatchFromRecipe.mockResolvedValue({ id: "batch-2" });
    mocks.startBrewOnDevice.mockResolvedValue({
      ok: true,
      heatingStarted: false,
      status: "brewing",
      externalId: "2",
      slot: 2,
      ack: { ok: false, reason: "REMOTE_DISABLED" },
      reason: "REMOTE_DISABLED"
    });

    const result = await startBrewOnDeviceFromRecipeAction({ recipeId: RECIPE_ID, deviceId: DEVICE_ID });

    expect(result.ok).toBe(true);
    expect(result.heatingStarted).toBe(false);
    expect(result.brewBatchId).toBe("batch-2");
    expect(result.reason).toBe("REMOTE_DISABLED");
    expect(result.message).toContain("слот 2");
    expect(result.message).toContain("Включите удалённое управление");
  });

  it("прочий nack: варка не начата, но партия уже создана (id партии наружу для честного UI)", async () => {
    mocks.createBrewBatchFromRecipe.mockResolvedValue({ id: "batch-3" });
    mocks.startBrewOnDevice.mockResolvedValue({
      ok: false,
      heatingStarted: false,
      status: "planned",
      externalId: "1",
      slot: 1,
      ack: { ok: false, reason: "REJECTED_INTERLOCK" },
      reason: "REJECTED_INTERLOCK"
    });

    const result = await startBrewOnDeviceFromRecipeAction({ recipeId: RECIPE_ID, deviceId: DEVICE_ID });

    expect(result.ok).toBe(false);
    expect(result.heatingStarted).toBe(false);
    expect(result.brewBatchId).toBe("batch-3");
    expect(result.reason).toBe("REJECTED_INTERLOCK");
    expect(result.message).toContain("интерлок");
  });

  it("рецепт недоступен: партия не создаётся, устройство не трогаем, id партии — null", async () => {
    mocks.createBrewBatchFromRecipe.mockRejectedValue(new Error("NOT_FOUND"));

    const result = await startBrewOnDeviceFromRecipeAction({ recipeId: RECIPE_ID, deviceId: DEVICE_ID });

    expect(result).toEqual({
      ok: false,
      heatingStarted: false,
      brewBatchId: null,
      message: "Рецепт не найден или недоступен для варки.",
      reason: null
    });
    expect(mocks.startBrewOnDevice).not.toHaveBeenCalled();
  });

  it("устройство недоступно ПОСЛЕ создания партии: id партии не теряется, даже если startBrewOnDevice бросает", async () => {
    mocks.createBrewBatchFromRecipe.mockResolvedValue({ id: "batch-4" });
    mocks.startBrewOnDevice.mockRejectedValue(new Error("DEVICE_NOT_FOUND"));

    const result = await startBrewOnDeviceFromRecipeAction({ recipeId: RECIPE_ID, deviceId: DEVICE_ID });

    expect(result.ok).toBe(false);
    expect(result.heatingStarted).toBe(false);
    expect(result.brewBatchId).toBe("batch-4");
    expect(result.message).toContain("Устройство не найдено");
  });
});
