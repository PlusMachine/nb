import { describe, expect, it } from "vitest";

import { hasBrewCapableOnlineTile, resolveReturnRecipeHref } from "./return-recipe-core";
import type { DeviceTile } from "./contracts";

// =============================================================================
//  Юнит-тесты ядра ветки «Сварить → Подключить BrewForge → Продолжить варку»
//  (Ф7, сквозной UX-проход 2026-07-15).
// =============================================================================

describe("resolveReturnRecipeHref", () => {
  it("свой рецепт — редактор с ?brew=1", () => {
    const href = resolveReturnRecipeHref(
      { id: "recipe-1", authorId: "user-1", slug: "my-ipa" },
      "user-1"
    );

    expect(href).toBe("/app/recipes/recipe-1/edit?brew=1");
  });

  it("чужой рецепт — публичная страница по slug с ?brew=1", () => {
    const href = resolveReturnRecipeHref(
      { id: "recipe-1", authorId: "author-2", slug: "pilsner-urquell" },
      "user-1"
    );

    expect(href).toBe("/recipes/pilsner-urquell?brew=1");
  });
});

const buildTile = (overrides: Partial<DeviceTile> = {}): DeviceTile => ({
  id: "device-1",
  name: "Пивоварня",
  hardwareId: "bf-0001",
  status: "online",
  fw: null,
  isDemo: false,
  lastSeenAt: null,
  createdAt: "2026-07-15T10:00:00.000Z",
  kind: "brewforge",
  snapshot: null,
  streamSnapshot: null,
  spark: [],
  ...overrides
});

describe("hasBrewCapableOnlineTile", () => {
  it("нет плиток — false", () => {
    expect(hasBrewCapableOnlineTile([])).toBe(false);
  });

  it("online BrewForge — true", () => {
    expect(hasBrewCapableOnlineTile([buildTile()])).toBe(true);
  });

  it("offline BrewForge — false", () => {
    expect(hasBrewCapableOnlineTile([buildTile({ status: "offline" })])).toBe(false);
  });

  it("online стрим-устройство (ареометр) не считается — не может варить", () => {
    expect(hasBrewCapableOnlineTile([buildTile({ kind: "stream", status: "online" })])).toBe(false);
  });

  it("смешанный список — находит online BrewForge среди прочих", () => {
    const tiles = [
      buildTile({ id: "a", kind: "stream", status: "online" }),
      buildTile({ id: "b", kind: "brewforge", status: "offline" }),
      buildTile({ id: "c", kind: "brewforge", status: "online" })
    ];

    expect(hasBrewCapableOnlineTile(tiles)).toBe(true);
  });
});
