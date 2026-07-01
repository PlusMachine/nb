import { describe, expect, it } from "vitest";

import {
  classifyTileFreshness,
  TILE_LIVE_WITHIN_MS,
  TILE_STALE_AFTER_MS,
} from "./contracts";

describe("classifyTileFreshness", () => {
  it("свежий срез — live", () => {
    expect(classifyTileFreshness(0)).toBe("live");
    expect(classifyTileFreshness(TILE_LIVE_WITHIN_MS)).toBe("live");
  });

  it("недавний срез — recent", () => {
    expect(classifyTileFreshness(TILE_LIVE_WITHIN_MS + 1)).toBe("recent");
    expect(classifyTileFreshness(TILE_STALE_AFTER_MS)).toBe("recent");
  });

  it("старый срез — stale", () => {
    expect(classifyTileFreshness(TILE_STALE_AFTER_MS + 1)).toBe("stale");
    expect(classifyTileFreshness(10 * 60_000)).toBe("stale");
  });
});
