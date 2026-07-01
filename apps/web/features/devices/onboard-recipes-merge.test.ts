import { describe, expect, it } from "vitest";

import { mergeOnboardSlots } from "./onboard-recipes-merge";

// =============================================================================
//  Юнит-тесты merge «слоты платы × привязки nb» (Phase 4). Герметично: чистая
//  функция без db/провайдера. Проверяем инвариант «занятость — от устройства,
//  привязка — от nb (и честно про удалённый рецепт)».
// =============================================================================

describe("mergeOnboardSlots", () => {
  it("занятость и имя берёт с платы (listSlots), не из привязки", () => {
    const out = mergeOnboardSlots(
      [
        { slot: 0, name: "IPA" },
        { slot: 1, name: null }
      ],
      []
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ slot: 0, onboardName: "IPA", occupied: true });
    expect(out[1]).toMatchObject({ slot: 1, onboardName: null, occupied: false });
    // без привязки — пусто
    expect(out[0].boundRecipeId).toBeNull();
    expect(out[0].boundRecipeName).toBeNull();
    expect(out[0].pushedAt).toBeNull();
  });

  it("мёржит привязку nb по номеру слота (recipeId + имя + pushedAt→ISO)", () => {
    const pushedAt = new Date("2026-07-01T10:00:00.000Z");
    const out = mergeOnboardSlots(
      [{ slot: 2, name: "Stout" }],
      [{ slot: 2, recipeId: "r-1", recipeName: "Stout", pushedAt }]
    );
    expect(out[0]).toEqual({
      slot: 2,
      onboardName: "Stout",
      occupied: true,
      boundRecipeId: "r-1",
      boundRecipeName: "Stout",
      pushedAt: "2026-07-01T10:00:00.000Z"
    });
  });

  it("честно про удалённый рецепт: recipeId=null, но имя сохранено", () => {
    const out = mergeOnboardSlots(
      [{ slot: 0, name: "Lager" }],
      [{ slot: 0, recipeId: null, recipeName: "Lager (был)", pushedAt: new Date() }]
    );
    expect(out[0].boundRecipeId).toBeNull();
    expect(out[0].boundRecipeName).toBe("Lager (был)");
  });

  it("привязку к слоту, которого нет на плате, игнорирует (выводим только слоты устройства)", () => {
    const out = mergeOnboardSlots(
      [{ slot: 0, name: "A" }],
      [{ slot: 5, recipeId: "r-9", recipeName: "Ghost", pushedAt: new Date() }]
    );
    expect(out).toHaveLength(1);
    expect(out[0].slot).toBe(0);
    expect(out[0].boundRecipeId).toBeNull();
  });

  it("pushedAt=null → pushedAt=null (без падения)", () => {
    const out = mergeOnboardSlots(
      [{ slot: 0, name: "A" }],
      [{ slot: 0, recipeId: "r-1", recipeName: "A", pushedAt: null }]
    );
    expect(out[0].pushedAt).toBeNull();
    expect(out[0].boundRecipeId).toBe("r-1");
  });
});
