import { describe, expect, it } from "vitest";

import { canModerateTransition, validateMergeInput } from "../features/ingredients/workflows";

describe("moderation transitions", () => {
  it("allows pending -> approve/reject/merge", () => {
    expect(canModerateTransition("pending", "approve")).toBe(true);
    expect(canModerateTransition("pending", "reject")).toBe(true);
    expect(canModerateTransition("pending", "merge")).toBe(true);
  });

  it("blocks transitions from resolved states", () => {
    expect(canModerateTransition("approved", "reject")).toBe(false);
  });
});

describe("merge duplicate validation", () => {
  it("throws on same source/target", () => {
    expect(() => validateMergeInput("a", "a")).toThrowError("SAME_INGREDIENT");
  });
});
