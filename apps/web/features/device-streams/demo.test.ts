import { describe, expect, it } from "vitest";

import { isDemoStreamDevice } from "./demo";

describe("stream demo identification", () => {
  it("keeps the demo marker after the user renames a synthetic sensor", () => {
    const sensor = { hardwareId: "st-demo-a1b2c3", name: "Ареометр в ЦКТ" };
    expect(isDemoStreamDevice(sensor)).toBe(true);
    expect(isDemoStreamDevice({ hardwareId: "st-a1b2c3" })).toBe(false);
  });
});
