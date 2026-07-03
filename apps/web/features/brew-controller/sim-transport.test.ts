import { describe, expect, it } from "vitest";

import { cmdSelectRecipe } from "@nb/brewforge-protocol";

import { simTransport } from "./sim-transport";

// =============================================================================
//  Юнит-тесты стаб-транспорта прод-демо (Phase 4.5): DeviceTransport поверх
//  in-process SimDevice. Герметично — без БД/сети/фонового таймера. Проверяем,
//  что провайдер не отличит демо от железа: телеметрия/команды/слоты/конфиг.
//  Каждый тест — свой deviceId (состояние симулятора живёт в модульном Map).
// =============================================================================

describe("simTransport", () => {
  it("демо всегда «в сети»: getTelemetry отдаёт снимок (не null)", async () => {
    const t = simTransport("sim-t-1");
    const tele = await t.getTelemetry();
    expect(tele).not.toBeNull();
    expect(tele?.stage).toBeDefined();
    expect(tele?.schema).toBe(1);
  });

  it("слоты: listSlots отдаёт ТОЛЬКО записываемый диапазон 6..25 (паритет с прошивкой, D1)", async () => {
    const t = simTransport("sim-t-2");
    const slots = await t.listSlots();
    // BF_MAX_RECIPES=26, 6 встроенных (0..5) + 20 записываемых (6..25).
    expect(slots).toHaveLength(20);
    expect(slots[0]).toEqual({ slot: 6, name: null });
    expect(slots.every((s) => s.slot >= 6 && s.slot <= 25)).toBe(true);
  });

  it("readSlotSnapshot: читает ЛЮБОЙ слот (в т.ч. встроенный 0), пустой → null, вне диапазона → null", async () => {
    const t = simTransport("sim-t-3");
    const s0 = await t.readSlotSnapshot(0);
    expect(s0?.name).toBe("Demo Pale Ale"); // слот 0 — «встроенный» демо-рецепт
    expect(await t.readSlotSnapshot(6)).toBeNull(); // пустой записываемый слот
    expect(await t.readSlotSnapshot(99)).toBeNull(); // вне диапазона 0..25 (поймано)
  });

  it("putRecipe БЕЗ slot — автовыбор первого свободного ЗАПИСЫВАЕМОГО слота (не 0 — паритет с pick_recipe_slot)", async () => {
    const t = simTransport("sim-t-4a");
    const demo = await t.readSlotSnapshot(0);
    expect(demo).not.toBeNull();

    const { slot } = await t.putRecipe(demo!);
    expect(slot).toBe(6); // первый свободный в диапазоне 6..25

    const s6 = await t.readSlotSnapshot(6);
    expect(s6?.name).toBe("Demo Pale Ale");
  });

  it("putRecipe в явный целевой слот → снапшот и listSlots обновляются", async () => {
    const t = simTransport("sim-t-4b");
    const demo = await t.readSlotSnapshot(0);
    expect(demo).not.toBeNull();

    const { slot } = await t.putRecipe(demo!, 8);
    expect(slot).toBe(8);

    const s8 = await t.readSlotSnapshot(8);
    expect(s8?.name).toBe("Demo Pale Ale");
    const slots = await t.listSlots();
    expect(slots.find((s) => s.slot === 8)).toEqual({ slot: 8, name: "Demo Pale Ale" });
  });

  it("putRecipe в НЕзаписываемый слот (встроенный 0..5) — отклоняется (паритет с BF_PROTO_ERR_BAD_SLOT)", async () => {
    const t = simTransport("sim-t-4c");
    const demo = await t.readSlotSnapshot(0);
    await expect(t.putRecipe(demo!, 3)).rejects.toThrow();
  });

  it("sendCommand: SELECT_RECIPE подтверждается Ack ok", async () => {
    const t = simTransport("sim-t-5");
    const ack = await t.sendCommand(cmdSelectRecipe(0));
    expect(ack.ok).toBe(true);
  });

  it("config round-trip: getConfig отдаёт конфиг, putConfig клампит и возвращает эффективный", async () => {
    const t = simTransport("sim-t-6");
    const cfg = await t.getConfig();
    expect(cfg).not.toBeNull();
    expect(cfg?.pid).toBeDefined();

    // Заведомо запредельный kp → устройство клампит в безопасный диапазон.
    const written = await t.putConfig({ pid: { kp: 999999 } });
    expect(written.pid.kp).toBeLessThan(999999);
  });
});
