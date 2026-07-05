import { describe, expect, it } from "vitest";

import {
  RATING_PRIOR_MEAN,
  RATING_PRIOR_WEIGHT,
  computeBayesianRating
} from "../features/recipes/rating-score";

describe("computeBayesianRating", () => {
  it("returns null when there are no ratings", () => {
    expect(computeBayesianRating(null, 0)).toBeNull();
    expect(computeBayesianRating(4.5, 0)).toBeNull();
    expect(computeBayesianRating(null, 3)).toBeNull();
    expect(computeBayesianRating(5, -1)).toBeNull();
  });

  it("pulls a single 5.0 toward the prior mean", () => {
    // (10*3.8 + 5*1) / (10 + 1) = 43/11 ≈ 3.909
    expect(computeBayesianRating(5, 1)).toBeCloseTo(3.909, 3);
  });

  it("ranks 120×4.8 above a single 5.0 — the core requirement", () => {
    const lonelyFive = computeBayesianRating(5, 1)!;
    const wellRated = computeBayesianRating(4.8, 120)!;
    expect(wellRated).toBeGreaterThan(lonelyFive);
    // Много оценок → скор близок к честному среднему.
    expect(wellRated).toBeCloseTo(4.72, 1);
  });

  it("approaches the true average as the count grows (monotonic in count)", () => {
    const avg = 4.6;
    const scores = [1, 5, 20, 100, 1000].map((n) => computeBayesianRating(avg, n)!);
    // avg (4.6) выше прайора (3.8) → скор монотонно растёт к avg с числом оценок.
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1]!);
    }
    expect(scores.at(-1)!).toBeCloseTo(avg, 1);
  });

  it("equals the prior mean when count equals the prior weight and avg is the mean", () => {
    expect(computeBayesianRating(RATING_PRIOR_MEAN, RATING_PRIOR_WEIGHT)).toBeCloseTo(RATING_PRIOR_MEAN, 6);
  });
});
