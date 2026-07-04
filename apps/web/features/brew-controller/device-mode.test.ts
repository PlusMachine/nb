import { describe, expect, it } from "vitest";

import { APP_MODE_NUM, STAGE_NUM, type Stage } from "@nb/brewforge-protocol";

import { deriveAppMode, deriveDeviceMode, deriveDeviceState, deriveTileBadge } from "./device-mode";

describe("deriveDeviceMode", () => {
  it("нет живого кадра → offline (даже если стадия известна)", () => {
    expect(deriveDeviceMode(null, false)).toBe("offline");
    expect(deriveDeviceMode({ stageName: "MASH_STEP" }, false)).toBe("offline");
    // Свежесть считает владелец подписки: нет кадра → offline даже при isLive.
    expect(deriveDeviceMode(null, true)).toBe("offline");
  });

  it("IDLE и DONE → idle (пивоварня свободна)", () => {
    expect(deriveDeviceMode({ stageName: "IDLE" }, true)).toBe("idle");
    expect(deriveDeviceMode({ stageName: "DONE" }, true)).toBe("idle");
  });

  it("MANUAL → manual", () => {
    expect(deriveDeviceMode({ stageName: "MANUAL" }, true)).toBe("manual");
  });

  it("FAULT → fault (плата остановлена по аварии)", () => {
    expect(deriveDeviceMode({ stageName: "FAULT" }, true)).toBe("fault");
  });

  it("стадии варки (в т.ч. промпты и пауза) → auto", () => {
    const autoStages: Stage[] = [
      "DELAYED_START",
      "PROMPT_SPARGE",
      "DOUGH_IN",
      "PROMPT_ADD_MALT",
      "MASH_STEP",
      "MASH_OUT",
      "PROMPT_IODINE",
      "PROMPT_REMOVE_MALT",
      "BOIL_RAMP",
      "BOILING",
      "HOP_STAND",
      "COOLING",
      "PAUSED",
    ];
    for (const stage of autoStages) {
      expect(deriveDeviceMode({ stageName: stage }, true)).toBe("auto");
    }
  });

  it("running-дистилляция/ферментация тоже даёт activity auto (activity режимо-независима)", () => {
    const runningStages: Stage[] = ["DISTILL_PREHEAT", "DISTILL_HEADS", "DISTILL_HEARTS", "DISTILL_TAILS", "FERMENT"];
    for (const stage of runningStages) {
      expect(deriveDeviceMode({ stageName: stage }, true)).toBe("auto");
    }
  });
});

describe("deriveAppMode", () => {
  it("нет телеметрии → null", () => {
    expect(deriveAppMode(null)).toBeNull();
  });

  it("running-стадии дистилляции перекрывают поле appMode", () => {
    const distillStages: Stage[] = ["DISTILL_PREHEAT", "DISTILL_HEADS", "DISTILL_HEARTS", "DISTILL_TAILS"];
    for (const stage of distillStages) {
      expect(
        deriveAppMode({ stageName: stage, pausedFrom: STAGE_NUM.IDLE, appMode: APP_MODE_NUM.brew }),
      ).toBe("distill");
    }
  });

  it("running-стадия FERMENT перекрывает поле appMode", () => {
    expect(
      deriveAppMode({ stageName: "FERMENT", pausedFrom: STAGE_NUM.IDLE, appMode: APP_MODE_NUM.brew }),
    ).toBe("ferment");
  });

  it("в IDLE (не running-стадия) решает поле appMode", () => {
    expect(
      deriveAppMode({ stageName: "IDLE", pausedFrom: STAGE_NUM.IDLE, appMode: APP_MODE_NUM.distill }),
    ).toBe("distill");
    expect(
      deriveAppMode({ stageName: "IDLE", pausedFrom: STAGE_NUM.IDLE, appMode: APP_MODE_NUM.ferment }),
    ).toBe("ferment");
  });

  it("нет поля appMode (старая прошивка) → дефолт brew", () => {
    expect(deriveAppMode({ stageName: "IDLE", pausedFrom: STAGE_NUM.IDLE, appMode: undefined })).toBe("brew");
    expect(deriveAppMode({ stageName: "MASH_STEP", pausedFrom: STAGE_NUM.IDLE, appMode: undefined })).toBe("brew");
  });

  it("PAUSED с pausedFrom=DISTILL_HEARTS → distill (пауза дистилляции не переключает в варку)", () => {
    expect(
      deriveAppMode({ stageName: "PAUSED", pausedFrom: STAGE_NUM.DISTILL_HEARTS, appMode: APP_MODE_NUM.brew }),
    ).toBe("distill");
  });

  it("FAULT с pausedFrom=FERMENT → ferment", () => {
    expect(
      deriveAppMode({ stageName: "FAULT", pausedFrom: STAGE_NUM.FERMENT, appMode: APP_MODE_NUM.brew }),
    ).toBe("ferment");
  });

  it("PAUSED/FAULT из варочной стадии — не running-режим, решает appMode/дефолт", () => {
    expect(
      deriveAppMode({ stageName: "PAUSED", pausedFrom: STAGE_NUM.BOILING, appMode: undefined }),
    ).toBe("brew");
  });
});

describe("deriveDeviceState", () => {
  it("сводит appMode и activity в одну пару", () => {
    expect(deriveDeviceState(null, true)).toEqual({ appMode: null, activity: "offline" });
    expect(
      deriveDeviceState({ stageName: "DISTILL_HEARTS", pausedFrom: STAGE_NUM.IDLE, appMode: undefined }, true),
    ).toEqual({ appMode: "distill", activity: "auto" });
    expect(
      deriveDeviceState({ stageName: "FAULT", pausedFrom: STAGE_NUM.FERMENT, appMode: undefined }, true),
    ).toEqual({ appMode: "ferment", activity: "fault" });
  });
});

describe("deriveTileBadge", () => {
  it("нет стадии (истории ещё нет) → бейджа нет", () => {
    expect(deriveTileBadge(null)).toBeNull();
  });

  it("IDLE/DONE → «Свободен»", () => {
    expect(deriveTileBadge(STAGE_NUM.IDLE)).toBe("Свободен");
    expect(deriveTileBadge(STAGE_NUM.DONE)).toBe("Свободен");
  });

  it("running-дистилляция (17–20) → «Дистилляция»", () => {
    for (const stage of [
      STAGE_NUM.DISTILL_PREHEAT,
      STAGE_NUM.DISTILL_HEADS,
      STAGE_NUM.DISTILL_HEARTS,
      STAGE_NUM.DISTILL_TAILS,
    ]) {
      expect(deriveTileBadge(stage)).toBe("Дистилляция");
    }
  });

  it("FERMENT (21) → «Ферментация»", () => {
    expect(deriveTileBadge(STAGE_NUM.FERMENT)).toBe("Ферментация");
  });

  it("MANUAL → «Ручной»", () => {
    expect(deriveTileBadge(STAGE_NUM.MANUAL)).toBe("Ручной");
  });

  it("варочные стадии (в т.ч. PAUSED/FAULT) → «Варка»", () => {
    for (const stage of [
      STAGE_NUM.DELAYED_START,
      STAGE_NUM.MASH_STEP,
      STAGE_NUM.BOILING,
      STAGE_NUM.HOP_STAND,
      STAGE_NUM.PAUSED,
      STAGE_NUM.FAULT,
    ]) {
      expect(deriveTileBadge(stage)).toBe("Варка");
    }
  });

  it("snapshot.appMode задан, стадия IDLE — плитка всё равно «Свободен» (режим смотрит пульт, а не эта функция)", () => {
    // deriveTileBadge принципиально не смотрит на appMode — параметр здесь
    // просто отсутствует, что и есть защита инварианта (§4.2).
    expect(deriveTileBadge(STAGE_NUM.IDLE)).toBe("Свободен");
  });

  it("PAUSED/FAULT с pausedFrom из дистилляции → «Дистилляция» (честный бейдж на паузе/аварии)", () => {
    for (const stage of [STAGE_NUM.PAUSED, STAGE_NUM.FAULT]) {
      for (const pausedFrom of [
        STAGE_NUM.DISTILL_PREHEAT,
        STAGE_NUM.DISTILL_HEADS,
        STAGE_NUM.DISTILL_HEARTS,
        STAGE_NUM.DISTILL_TAILS,
      ]) {
        expect(deriveTileBadge(stage, pausedFrom)).toBe("Дистилляция");
      }
    }
  });

  it("PAUSED/FAULT с pausedFrom=FERMENT → «Ферментация»", () => {
    expect(deriveTileBadge(STAGE_NUM.PAUSED, STAGE_NUM.FERMENT)).toBe("Ферментация");
    expect(deriveTileBadge(STAGE_NUM.FAULT, STAGE_NUM.FERMENT)).toBe("Ферментация");
  });

  it("PAUSED/FAULT с pausedFrom из варочной стадии → «Варка»", () => {
    expect(deriveTileBadge(STAGE_NUM.PAUSED, STAGE_NUM.BOILING)).toBe("Варка");
    expect(deriveTileBadge(STAGE_NUM.FAULT, STAGE_NUM.MASH_STEP)).toBe("Варка");
  });

  it("PAUSED/FAULT без pausedFrom (null/undefined/неизвестный) → «Варка» по умолчанию", () => {
    expect(deriveTileBadge(STAGE_NUM.PAUSED, null)).toBe("Варка");
    expect(deriveTileBadge(STAGE_NUM.FAULT, undefined)).toBe("Варка");
    expect(deriveTileBadge(STAGE_NUM.PAUSED)).toBe("Варка");
  });
});
