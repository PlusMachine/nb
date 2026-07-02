import { describe, expect, it } from "vitest";

import { resolveBrewCompletionRatingSlug } from "../features/brew-batches/completion";

const OWNER = "user-1";
const OTHER = "user-2";

const candidate = (overrides: Partial<{ authorId: string; publicationState: string; slug: string }> = {}) => ({
  authorId: OTHER,
  publicationState: "published",
  slug: "foreign-recipe",
  ...overrides
});

describe("resolveBrewCompletionRatingSlug", () => {
  it("returns null when the batch is not completed", () => {
    expect(resolveBrewCompletionRatingSlug("fermenting", OWNER, candidate())).toBeNull();
  });

  it("returns null when there is no candidate (recipe gone/inaccessible)", () => {
    expect(resolveBrewCompletionRatingSlug("completed", OWNER, null)).toBeNull();
  });

  it("returns null for the viewer's own recipe", () => {
    expect(resolveBrewCompletionRatingSlug("completed", OWNER, candidate({ authorId: OWNER }))).toBeNull();
  });

  it("returns null when the recipe is not published", () => {
    expect(resolveBrewCompletionRatingSlug("completed", OWNER, candidate({ publicationState: "private" }))).toBeNull();
    expect(resolveBrewCompletionRatingSlug("completed", OWNER, candidate({ publicationState: "draft" }))).toBeNull();
  });

  it("returns the slug when completed, foreign, and published", () => {
    expect(resolveBrewCompletionRatingSlug("completed", OWNER, candidate())).toBe("foreign-recipe");
  });
});
