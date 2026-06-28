import { describe, expect, it } from "vitest";

import { resolveBrewabilityBadge } from "../features/recipes/brewability-badge";

// Хелпер: минимальный срез RecipeMatchDto, который читает резолвер.
const dto = (totalLines: number, coveredLines: number, missingCount: number) => ({
  totalLines,
  coveredLines,
  missingCount
});

describe("resolveBrewabilityBadge", () => {
  it("ready when every ingredient type is present (quantity not required)", () => {
    const badge = resolveBrewabilityBadge(dto(3, 3, 0));
    expect(badge.tier).toBe("ready");
    expect(badge.qtyShort).toBe(false);
    expect(badge.missing).toBe(0);
  });

  it("ready but qtyShort when all types present yet some quantity is short", () => {
    // covered (хватает кол-ва) < total, при missing === 0 → есть всё, но где-то мало
    const badge = resolveBrewabilityBadge(dto(3, 2, 0));
    expect(badge.tier).toBe("ready");
    expect(badge.qtyShort).toBe(true);
  });

  it("brand-cascade: a pilsner covered via a different brand counts as ready", () => {
    // строка покрыта substitute'ом (другой бренд) → missingCount 0 → бейдж ready
    const badge = resolveBrewabilityBadge(dto(1, 1, 0));
    expect(badge.tier).toBe("ready");
  });

  it("almost with the missing count when ≥70% of types are present", () => {
    // 4 строки, 1 отсутствует → typeCoverage 0.75 ≥ 0.7
    const badge = resolveBrewabilityBadge(dto(4, 2, 1));
    expect(badge.tier).toBe("almost");
    expect(badge.missing).toBe(1);
  });

  it("almost when missing exactly 2 and ≥70% types present", () => {
    // 7 строк, 2 отсутствуют → typeCoverage 5/7 ≈ 0.714 ≥ 0.7, missing 2 ≤ 2
    const badge = resolveBrewabilityBadge(dto(7, 5, 2));
    expect(badge.tier).toBe("almost");
    expect(badge.missing).toBe(2);
  });

  it("hidden (junk) when fewer than 70% of types are present", () => {
    // 4 строки, 2 отсутствуют → typeCoverage 0.5 < 0.7
    expect(resolveBrewabilityBadge(dto(4, 1, 2)).tier).toBe("hidden");
  });

  it("hidden when missing more than 2, even if ≥70% types present", () => {
    // длинный рецепт: 10 строк, 3 отсутствуют → typeCoverage 0.7 ≥ 0.7, но
    // «не хватает 3» — это не «почти» → бейджа нет (абсолютный потолок)
    expect(resolveBrewabilityBadge(dto(10, 7, 3)).tier).toBe("hidden");
    // 14 строк, 4 отсутствуют → typeCoverage 0.714, но missing 4 > 2 → hidden
    expect(resolveBrewabilityBadge(dto(14, 10, 4)).tier).toBe("hidden");
  });

  it("hidden when the recipe has no lines", () => {
    expect(resolveBrewabilityBadge(dto(0, 0, 0)).tier).toBe("hidden");
  });
});
