import { describe, expect, it } from "vitest";

import { CMD_TYPE_NUM, COMMAND_TYPE_NAMES, CommandTypeSchema } from "./enums";

// =============================================================================
//  Юнит-тесты CMD_TYPE_NUM/COMMAND_TYPE_NAMES — пакет №2 §13 (Этапы 6-A/6-D
//  прошивки): MANUAL_PUMP2/MANUAL_VALVE/MANUAL_COOL вставлены в bf_cmd_type_t
//  СРАЗУ ПОСЛЕ MANUAL_PUMP, сдвигая START_AUTOTUNE..ACK_HOP на +3; FORCE_PUMP/
//  FORCE_PUMP2/FORCE_VALVE дописаны в конец enum. Числа — справочные (провод
//  идёт строкой, cmd_lookup в bf_proto.c сравнивает по имени), но должны 1:1
//  совпадать с components/common/include/bf_types.h для кросс-сверки.
// =============================================================================

describe("CMD_TYPE_NUM — Этап 6-A/6-D (§13)", () => {
  it("MANUAL_PUMP2/MANUAL_VALVE/MANUAL_COOL идут сразу после MANUAL_PUMP", () => {
    expect(CMD_TYPE_NUM.MANUAL_PUMP).toBe(14);
    expect(CMD_TYPE_NUM.MANUAL_PUMP2).toBe(15);
    expect(CMD_TYPE_NUM.MANUAL_VALVE).toBe(16);
    expect(CMD_TYPE_NUM.MANUAL_COOL).toBe(17);
  });

  it("вставка сдвигает START_AUTOTUNE..SAVE_SETTINGS на +3 относительно прежней таблицы", () => {
    expect(CMD_TYPE_NUM.START_AUTOTUNE).toBe(18);
    expect(CMD_TYPE_NUM.ESTOP).toBe(19);
    expect(CMD_TYPE_NUM.CLEAR_FAULT).toBe(20);
    expect(CMD_TYPE_NUM.SAVE_SETTINGS).toBe(21);
  });

  it("ACK_HOP сдвинут на +3 (33 → 36), т.к. идёт после локальных-только команд", () => {
    expect(CMD_TYPE_NUM.ACK_HOP).toBe(36);
  });

  it("FORCE_PUMP/FORCE_PUMP2/FORCE_VALVE дописаны в самый конец enum (37..39)", () => {
    expect(CMD_TYPE_NUM.FORCE_PUMP).toBe(37);
    expect(CMD_TYPE_NUM.FORCE_PUMP2).toBe(38);
    expect(CMD_TYPE_NUM.FORCE_VALVE).toBe(39);
  });

  it("все значения CMD_TYPE_NUM уникальны (нет коллизий при сдвиге)", () => {
    const values = Object.values(CMD_TYPE_NUM);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("COMMAND_TYPE_NAMES / CommandTypeSchema — новые сетевые команды", () => {
  it.each([
    "MANUAL_PUMP2",
    "MANUAL_VALVE",
    "MANUAL_COOL",
    "FORCE_PUMP",
    "FORCE_PUMP2",
    "FORCE_VALVE",
  ] as const)("%s присутствует в COMMAND_TYPE_NAMES и проходит CommandTypeSchema", (name) => {
    expect(COMMAND_TYPE_NAMES).toContain(name);
    expect(CommandTypeSchema.safeParse(name).success).toBe(true);
  });

  it("NONE по-прежнему не проходит CommandTypeSchema (не передаётся по проводу)", () => {
    expect(CommandTypeSchema.safeParse("NONE").success).toBe(false);
  });
});
