import { describe, expect, it } from "vitest";

import {
  cmdManualPump2,
  cmdManualValve,
  cmdManualCool,
  cmdForcePump,
  cmdForcePump2,
  cmdForceValve,
  CommandSchema,
} from "./command";

// =============================================================================
//  Юнит-тесты билдеров MANUAL_PUMP2/VALVE/COOL и FORCE_PUMP/PUMP2/VALVE —
//  пакет №2 §13. Проверяем: тип команды, arg.b (union bf_cmd_t.arg), что
//  результат — валидный Command (CommandSchema), уникальный id/ts.
// =============================================================================

describe("cmdManualPump2/cmdManualValve/cmdManualCool — Этап 6-A (только BF_STAGE_MANUAL)", () => {
  it.each([
    ["cmdManualPump2", cmdManualPump2, "MANUAL_PUMP2"],
    ["cmdManualValve", cmdManualValve, "MANUAL_VALVE"],
    ["cmdManualCool", cmdManualCool, "MANUAL_COOL"],
  ] as const)("%s(true) → type=%s, arg.b=true", (_label, builder, type) => {
    const cmd = builder(true);
    expect(cmd.type).toBe(type);
    expect(cmd.arg).toEqual({ b: true });
    expect(CommandSchema.safeParse(cmd).success).toBe(true);
  });

  it.each([
    ["cmdManualPump2", cmdManualPump2, "MANUAL_PUMP2"],
    ["cmdManualValve", cmdManualValve, "MANUAL_VALVE"],
    ["cmdManualCool", cmdManualCool, "MANUAL_COOL"],
  ] as const)("%s(false) → type=%s, arg.b=false", (_label, builder, type) => {
    const cmd = builder(false);
    expect(cmd.type).toBe(type);
    expect(cmd.arg).toEqual({ b: false });
  });

  it("пробрасывает auth-токен, если передан", () => {
    const cmd = cmdManualCool(true, "tok-123");
    expect(cmd.auth).toBe("tok-123");
  });
});

describe("cmdForcePump/cmdForcePump2/cmdForceValve — Этап 6-D (любая стадия, кроме FAULT)", () => {
  it.each([
    ["cmdForcePump", cmdForcePump, "FORCE_PUMP"],
    ["cmdForcePump2", cmdForcePump2, "FORCE_PUMP2"],
    ["cmdForceValve", cmdForceValve, "FORCE_VALVE"],
  ] as const)("%s(true) → type=%s, arg.b=true, валидная Command", (_label, builder, type) => {
    const cmd = builder(true);
    expect(cmd.type).toBe(type);
    expect(cmd.arg).toEqual({ b: true });
    expect(CommandSchema.safeParse(cmd).success).toBe(true);
    expect(typeof cmd.id).toBe("string");
    expect(cmd.id.length).toBeGreaterThan(0);
  });

  it("каждый вызов билдера даёт уникальный id", () => {
    const a = cmdForcePump(true);
    const b = cmdForcePump(true);
    expect(a.id).not.toBe(b.id);
  });
});
