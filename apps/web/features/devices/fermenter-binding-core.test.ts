import { describe, expect, it } from "vitest";

import { isFermenterModeRow } from "./fermenter-binding-core";

// =============================================================================
//  Юнит-тесты isFermenterModeRow — маппинг last-known appMode/stage → "это
//  прибор-ферментер?" для пикера «бродит в приборе …» (§8.4).
// =============================================================================

describe("isFermenterModeRow", () => {
  it("appMode=2 (ferment) → true, независимо от stage", () => {
    expect(isFermenterModeRow(2, null)).toBe(true);
    expect(isFermenterModeRow(2, 5)).toBe(true);
  });

  it("appMode=0 (brew) → false, даже если stage=21 (не должно так приходить, но appMode авторитетен)", () => {
    expect(isFermenterModeRow(0, 21)).toBe(false);
  });

  it("appMode=1 (distill) → false", () => {
    expect(isFermenterModeRow(1, null)).toBe(false);
  });

  it("appMode отсутствует (null), stage=21 (FERMENT) → true — старая прошивка без appMode", () => {
    expect(isFermenterModeRow(null, 21)).toBe(true);
  });

  it("appMode отсутствует, stage=5 (MASH_STEP) → false", () => {
    expect(isFermenterModeRow(null, 5)).toBe(false);
  });

  it("оба null (нет истории телеметрии) → false, не кандидат", () => {
    expect(isFermenterModeRow(null, null)).toBe(false);
  });
});
