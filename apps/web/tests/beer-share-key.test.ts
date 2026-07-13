import { describe, expect, it } from "vitest";

import { buildBeerShareKey, verifyBeerShareKey } from "../features/beer-page/share-key";

// Ключ детерминированный (HMAC от id рецепта): один и тот же между печатями,
// разный между рецептами, не подделывается без секрета.

describe("beer share key", () => {
  it("стабилен для рецепта и проходит проверку", () => {
    const key = buildBeerShareKey("11111111-1111-1111-1111-111111111111");
    expect(key).toBe(buildBeerShareKey("11111111-1111-1111-1111-111111111111"));
    expect(verifyBeerShareKey("11111111-1111-1111-1111-111111111111", key)).toBe(true);
  });

  it("ключ одного рецепта не открывает другой", () => {
    const key = buildBeerShareKey("11111111-1111-1111-1111-111111111111");
    expect(verifyBeerShareKey("22222222-2222-2222-2222-222222222222", key)).toBe(false);
  });

  it("мусор и пустота отклоняются", () => {
    expect(verifyBeerShareKey("r1", null)).toBe(false);
    expect(verifyBeerShareKey("r1", undefined)).toBe(false);
    expect(verifyBeerShareKey("r1", "")).toBe(false);
    expect(verifyBeerShareKey("r1", "короткий")).toBe(false);
    expect(verifyBeerShareKey("r1", "x".repeat(64))).toBe(false);
  });
});
