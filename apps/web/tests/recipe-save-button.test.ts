import { describe, expect, it } from "vitest";

import { resolveSaveToastAction } from "../components/recipes/recipe-save-button";

describe("resolveSaveToastAction — П2: тост после «В закладки» ведёт туда, где есть действие", () => {
  it("ведёт в список покупок, когда в рецепте есть нехватки", () => {
    expect(resolveSaveToastAction(3)).toEqual({ label: "Чего не хватает", href: "/app/shopping" });
    expect(resolveSaveToastAction(1)).toEqual({ label: "Чего не хватает", href: "/app/shopping" });
  });

  it("ведёт в закладки, когда нехваток нет", () => {
    expect(resolveSaveToastAction(0)).toEqual({ label: "Закладки", href: "/app/saved" });
  });

  it("ведёт в закладки, когда матч недоступен (null — витрина/аноним/матч ещё не загружен)", () => {
    expect(resolveSaveToastAction(null)).toEqual({ label: "Закладки", href: "/app/saved" });
  });
});
