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

  it("слоты: демо-рецепт в слоте 0, пустые слоты — null-имя", async () => {
    const t = simTransport("sim-t-2");
    const slots = await t.listSlots();
    expect(slots).toHaveLength(8);
    expect(slots[0]).toEqual({ slot: 0, name: "Demo Pale Ale" });
    expect(slots[1]?.name).toBeNull();
  });

  it("readSlotSnapshot: занятый → рецепт, пустой → null, вне диапазона → null", async () => {
    const t = simTransport("sim-t-3");
    const s0 = await t.readSlotSnapshot(0);
    expect(s0?.name).toBe("Demo Pale Ale");
    expect(await t.readSlotSnapshot(5)).toBeNull(); // пустой слот
    expect(await t.readSlotSnapshot(99)).toBeNull(); // вне диапазона (поймано)
  });

  it("putRecipe в целевой слот → снапшот и listSlots обновляются", async () => {
    const t = simTransport("sim-t-4");
    const demo = await t.readSlotSnapshot(0);
    expect(demo).not.toBeNull();

    const { slot } = await t.putRecipe(demo!, 3);
    expect(slot).toBe(3);

    const s3 = await t.readSlotSnapshot(3);
    expect(s3?.name).toBe("Demo Pale Ale");
    const slots = await t.listSlots();
    expect(slots[3]).toEqual({ slot: 3, name: "Demo Pale Ale" });
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
