import { describe, expect, it } from "vitest";

import type { Stage } from "@nb/brewforge-protocol";

import { deriveDeviceMode } from "./device-mode";

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
});
