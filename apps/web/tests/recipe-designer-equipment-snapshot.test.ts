import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@nb/ui";

import {
  RecipeDesigner,
  buildStatsDivergence,
  resolveInitialEquipmentState
} from "../components/recipes/recipe-designer";
import type { EquipmentProfileDto, EquipmentProfileSnapshot } from "../features/equipment-profiles/contracts";
import { defaultRecipeProcessMeta, type RecipeDetailDto } from "../features/recipes/contracts";

// Ф1 (сквозной UX-проход 2026-07-15), часть А+C: копия чужого/публичного рецепта
// хранит equipmentProfileId автора оригинала — он не находится среди профилей
// текущего пользователя. Раньше это молча роняло валидный equipmentProfileSnapshot
// рецепта в null (DEFAULT_EVAPORATION_RATE плыл в превью), а плашка расхождения
// статов вообще не существовала.

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/recipes/new",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams()
}));

vi.mock("../app/(app)/app/recipes/actions", () => ({
  createRecipeAction: vi.fn(),
  updateRecipeAction: vi.fn(),
  createRecipeVersionAction: vi.fn(),
  createBrewBatchFromRecipeAction: vi.fn(),
  deleteRecipeAction: vi.fn(async () => ({ ok: true, message: "Рецепт удален." })),
  previewRecipeDraftAction: vi.fn(),
  createRecipeCustomIngredientAction: vi.fn(),
  exportRecipeBeerXmlAction: vi.fn(),
  importBeerXmlRecipeAction: vi.fn(),
  importBrewfatherJsonRecipeAction: vi.fn(),
  proposeRecipeIngredientAction: vi.fn()
}));

const buildRecipeDetail = (overrides: Partial<RecipeDetailDto> = {}): RecipeDetailDto => ({
  id: "recipe-1",
  authorId: "user-1",
  recipeFamilyId: "family-1",
  versionNumber: 1,
  versionCount: 1,
  publicationState: "private",
  hiddenAt: null,
  hiddenReason: null,
  title: "Тестовый рецепт",
  slug: "test-recipe",
  styleId: null,
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  efficiency: 75,
  boilTimeMinutes: 60,
  og: null,
  fg: null,
  abv: null,
  ibu: null,
  color: null,
  createdAt: new Date("2026-04-20T10:00:00Z"),
  updatedAt: new Date("2026-04-20T10:00:00Z"),
  description: null,
  authorNotes: null,
  authorDisplayName: null,
  processMeta: defaultRecipeProcessMeta,
  calculationMeta: null,
  heroImageId: null,
  rating: null,
  ingredients: [],
  versions: [],
  completedBrewCount: 0,
  ...overrides
} as RecipeDetailDto);

const buildEquipmentProfile = (overrides: Partial<EquipmentProfileDto> = {}): EquipmentProfileDto => ({
  id: "profile-1",
  userId: "user-1",
  name: "Клон Braumeister",
  targetBatchVolumeL: 27,
  brewhouseEfficiencyPct: 72,
  evaporationRateLPerHr: 3,
  trubChillerLossL: 1,
  fermenterLossL: 0,
  grainAbsorptionLPerKg: 0.8,
  coolingShrinkagePct: 4,
  mashThicknessLPerKg: 3,
  mashTunDeadspaceL: 0,
  minMashVolumeL: null,
  maxMashVolumeL: null,
  maxGrainKg: null,
  maxKettleVolumeL: null,
  hopUtilizationFactor: 1,
  altitudeM: 0,
  notes: null,
  isDefault: true,
  createdAt: new Date("2026-04-20T10:00:00Z"),
  updatedAt: new Date("2026-04-20T10:00:00Z"),
  ...overrides
} as EquipmentProfileDto);

const buildEquipmentSnapshot = (overrides: Partial<EquipmentProfileSnapshot> = {}): EquipmentProfileSnapshot => ({
  id: "profile-author",
  snapshotAt: "2026-04-20T10:00:00.000Z",
  name: "Оборудование автора рецепта",
  targetBatchVolumeL: 19,
  brewhouseEfficiencyPct: 68,
  evaporationRateLPerHr: 2.5,
  trubChillerLossL: 0.8,
  fermenterLossL: 0,
  grainAbsorptionLPerKg: 0.75,
  coolingShrinkagePct: 3,
  mashThicknessLPerKg: 3,
  mashTunDeadspaceL: 0,
  minMashVolumeL: null,
  maxMashVolumeL: null,
  maxGrainKg: null,
  maxKettleVolumeL: null,
  hopUtilizationFactor: 1,
  altitudeM: 0,
  notes: null,
  ...overrides
} as EquipmentProfileSnapshot);

// RecipeDesigner вызывает useToast на верхнем уровне — статический рендер обязан
// идти внутри ToastProvider из @nb/ui (см. tests/recipe-editor-components.test.ts).
const renderDesignerMarkup = (props: React.ComponentProps<typeof RecipeDesigner>) =>
  renderToStaticMarkup(React.createElement(ToastProvider, null, React.createElement(RecipeDesigner, props)));

describe("resolveInitialEquipmentState", () => {
  it("свой профиль найден — profileId и снапшот из рецепта", () => {
    const ownedProfile = buildEquipmentProfile({ id: "profile-1" });
    const recipe = buildRecipeDetail({
      equipmentProfileId: "profile-1",
      equipmentProfileSnapshot: buildEquipmentSnapshot({ id: "profile-1", name: "Мой клон" })
    });

    const state = resolveInitialEquipmentState(recipe, [ownedProfile]);

    expect(state.profileId).toBe("profile-1");
    expect(state.snapshot?.name).toBe("Мой клон");
    expect(state.isInheritedSnapshot).toBe(false);
  });

  it("свой id найден, снапшота в рецепте нет — снапшот собирается из DTO", () => {
    const ownedProfile = buildEquipmentProfile({ id: "profile-1", name: "Клон Braumeister" });
    const recipe = buildRecipeDetail({
      equipmentProfileId: "profile-1",
      equipmentProfileSnapshot: null
    });

    const state = resolveInitialEquipmentState(recipe, [ownedProfile]);

    expect(state.profileId).toBe("profile-1");
    expect(state.snapshot?.name).toBe("Клон Braumeister");
    expect(state.isInheritedSnapshot).toBe(false);
  });

  it("чужой id + валидный снапшот — снапшот унаследован, profileId не тащим", () => {
    const recipe = buildRecipeDetail({
      equipmentProfileId: "profile-author",
      equipmentProfileSnapshot: buildEquipmentSnapshot()
    });

    const state = resolveInitialEquipmentState(recipe, []);

    expect(state.profileId).toBeNull();
    expect(state.snapshot?.name).toBe("Оборудование автора рецепта");
    expect(state.isInheritedSnapshot).toBe(true);
  });

  it("ни снапшота, ни своего профиля — null без вранья", () => {
    const recipe = buildRecipeDetail({
      equipmentProfileId: "profile-author",
      equipmentProfileSnapshot: null
    });

    const state = resolveInitialEquipmentState(recipe, []);

    expect(state.profileId).toBeNull();
    expect(state.snapshot).toBeNull();
    expect(state.isInheritedSnapshot).toBe(false);
  });

  it("новый рецепт (initialRecipe отсутствует) — пустое состояние", () => {
    const state = resolveInitialEquipmentState(undefined, [buildEquipmentProfile()]);

    expect(state).toEqual({ profileId: null, snapshot: null, isInheritedSnapshot: false });
  });
});

describe("buildStatsDivergence", () => {
  it("все статы совпали — пусто", () => {
    const entries = buildStatsDivergence(
      { og: 1.05, abv: 5, ibu: 40, color: 4 },
      { og: 1.05, abv: 5, ibu: 40, color: 4 },
      "sg"
    );

    expect(entries).toEqual([]);
  });

  it("часть разошлась — в списке только разошедшиеся метрики", () => {
    const entries = buildStatsDivergence(
      { og: 1.05, abv: 4.4, ibu: 40, color: 4 },
      { og: 1.05, abv: 5.8, ibu: 42.5, color: 4 },
      "sg"
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]).toContain("ABV");
    expect(entries[0]).toContain("4.4");
    expect(entries[0]).toContain("5.8");
    expect(entries[1]).toContain("IBU");
    expect(entries[1]).toContain("40");
    expect(entries[1]).toContain("43");
  });

  it("допуски-границы: ровно на пороге — не расхождение, чуть выше — расхождение", () => {
    // og: допуск 0.002
    expect(buildStatsDivergence({ og: 1.050, abv: null, ibu: null, color: null }, { og: 1.052, abv: null, ibu: null, color: null }, "sg")).toEqual([]);
    expect(buildStatsDivergence({ og: 1.050, abv: null, ibu: null, color: null }, { og: 1.0521, abv: null, ibu: null, color: null }, "sg")).toHaveLength(1);

    // abv: допуск 0.2 п.п.
    expect(buildStatsDivergence({ og: null, abv: 5, ibu: null, color: null }, { og: null, abv: 5.2, ibu: null, color: null }, "sg")).toEqual([]);
    expect(buildStatsDivergence({ og: null, abv: 5, ibu: null, color: null }, { og: null, abv: 5.21, ibu: null, color: null }, "sg")).toHaveLength(1);

    // ibu: допуск 2
    expect(buildStatsDivergence({ og: null, abv: null, ibu: 40, color: null }, { og: null, abv: null, ibu: 42, color: null }, "sg")).toEqual([]);
    expect(buildStatsDivergence({ og: null, abv: null, ibu: 40, color: null }, { og: null, abv: null, ibu: 42.1, color: null }, "sg")).toHaveLength(1);

    // color (SRM): допуск 0.5
    expect(buildStatsDivergence({ og: null, abv: null, ibu: null, color: 4 }, { og: null, abv: null, ibu: null, color: 4.5 }, "sg")).toEqual([]);
    expect(buildStatsDivergence({ og: null, abv: null, ibu: null, color: 4 }, { og: null, abv: null, ibu: null, color: 4.6 }, "sg")).toHaveLength(1);
  });

  it("null в сохранённых статах — метрика не сравнивается", () => {
    const entries = buildStatsDivergence(
      { og: null, abv: null, ibu: null, color: null },
      { og: 1.06, abv: 6, ibu: 50, color: 8 },
      "sg"
    );

    expect(entries).toEqual([]);
  });
});

describe("RecipeDesigner: честный селект «Оборудование» для унаследованного снапшота", () => {
  it("чужой equipmentProfileId + валидный снапшот, свои профили пусты — синтетическая опция, не «Без профиля»", () => {
    const html = renderDesignerMarkup({
      mode: "edit",
      initialRecipe: buildRecipeDetail({
        equipmentProfileId: "profile-author",
        equipmentProfileSnapshot: buildEquipmentSnapshot()
      }),
      equipmentProfiles: [],
      preferredGravityUnit: "plato"
    });

    expect(html).toContain("Оборудование автора рецепта");
    // Опция-выбор «Без профиля — ручной ввод параметров» в списке остаётся, но
    // короткая метка "Без профиля" (используемая только как текущий выбор селекта)
    // на странице появляться не должна.
    expect(html).toContain("Без профиля — ручной ввод параметров");
    expect(html).not.toMatch(/>Без профиля</);
  });
});
