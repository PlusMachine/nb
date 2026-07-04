import { describe, expect, it } from "vitest";

import { STAGE_NAMES } from "@nb/brewforge-protocol";

import { STAGE_LABELS, stageLabel } from "./stage-labels";

// Машинное имя стадии — SCREAMING_SNAKE_CASE. Подпись не должна ему совпадать
// (иначе герой пульта снова покажет что-то вроде MASH_STEP/DISTILL_HEARTS).
const MACHINE_NAME_RE = /^[A-Z_]+$/;

describe("STAGE_LABELS", () => {
  it("покрывает все стадии протокола (в т.ч. дистилляцию/ферментацию, пакет 4-B)", () => {
    for (const stage of STAGE_NAMES) {
      expect(STAGE_LABELS[stage]).toBeDefined();
    }
    expect(Object.keys(STAGE_LABELS).sort()).toEqual([...STAGE_NAMES].sort());
  });

  it("ни одна подпись не пустая", () => {
    for (const stage of STAGE_NAMES) {
      expect(STAGE_LABELS[stage].length).toBeGreaterThan(0);
    }
  });

  it("ни одна подпись не совпадает с машинным именем", () => {
    for (const stage of STAGE_NAMES) {
      expect(STAGE_LABELS[stage]).not.toBe(stage);
      expect(MACHINE_NAME_RE.test(STAGE_LABELS[stage])).toBe(false);
    }
  });
});

describe("stageLabel", () => {
  it("возвращает подпись из STAGE_LABELS для любой стадии", () => {
    for (const stage of STAGE_NAMES) {
      expect(stageLabel(stage)).toBe(STAGE_LABELS[stage]);
    }
  });

  it("новые стадии пакета 4-B (дистилляция/ферментация) читаемы", () => {
    expect(stageLabel("DISTILL_PREHEAT")).toBe("Разогрев");
    expect(stageLabel("DISTILL_HEADS")).toBe("Отбор голов");
    expect(stageLabel("DISTILL_HEARTS")).toBe("Отбор тела");
    expect(stageLabel("DISTILL_TAILS")).toBe("Отбор хвостов");
    expect(stageLabel("FERMENT")).toBe("Ферментация");
  });
});
