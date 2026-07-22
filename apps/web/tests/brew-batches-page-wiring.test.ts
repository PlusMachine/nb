import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ToastProvider } from "@nb/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";

const plannedBrew = {
  id: "bb-1",
  name: "Planned Brew",
  brewNumber: 1,
  status: "planned" as const,
  recipeId: "r-1",
  recipeTitle: "Test Recipe",
  hasDevice: false,
  plannedFor: null,
  startedAt: null,
  completedAt: null,
  createdAt: new Date("2026-06-27T09:00:00Z"),
  updatedAt: new Date("2026-06-27T09:00:00Z")
};

const brewingBrew = {
  ...plannedBrew,
  id: "bb-2",
  name: "Brewing Brew",
  brewNumber: 2,
  status: "brewing" as const,
  startedAt: new Date("2026-06-28T10:00:00Z"),
  createdAt: new Date("2026-06-28T09:00:00Z")
};

const completedBrew = {
  ...plannedBrew,
  id: "bb-3",
  name: "Completed Brew",
  brewNumber: 3,
  status: "completed" as const,
  completedAt: new Date("2026-06-20T10:00:00Z"),
  createdAt: new Date("2026-06-19T09:00:00Z")
};

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "u-1", email: "brewer@example.com", displayName: "Brewer", preferredGravityUnit: "plato" as const })),
  listBrewBatchesForUser: vi.fn(async (): Promise<unknown[]> => []),
  getBrewBatchDetail: vi.fn(async (): Promise<unknown> => null),
  getDeviceTelemetryHistory: vi.fn(async (): Promise<unknown[]> => []),
  getBrewBatchInventoryView: vi.fn(async (): Promise<unknown> => null),
  getDeviceById: vi.fn(async (): Promise<unknown> => null),
  listFermenterCandidates: vi.fn(async (): Promise<unknown[]> => []),
  getRecipeById: vi.fn(async (): Promise<unknown> => { throw new Error("NOT_FOUND"); }),
  computeRecipeMatch: vi.fn(async (): Promise<unknown> => ({ lines: [] })),
  // Пропсы дочерних досок ловим шпионами: подтверждение завершения живёт в
  // закрытом Dialog, а подсказка журнала — во внутреннем состоянии; в статичной
  // разметке их не видно, а проверять надо именно проводку страницы.
  journalProps: [] as Record<string, unknown>[],
  fermentationProps: [] as Record<string, unknown>[]
}));

vi.mock("../lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("../features/brew-batches/service", () => ({
  listBrewBatchesForUser: mocks.listBrewBatchesForUser,
  getBrewBatchDetail: mocks.getBrewBatchDetail,
  getDeviceTelemetryHistory: mocks.getDeviceTelemetryHistory
}));
vi.mock("../features/brew-batches/inventory", () => ({
  getBrewBatchInventoryView: mocks.getBrewBatchInventoryView
}));
vi.mock("../features/devices/service", () => ({ getDeviceById: mocks.getDeviceById }));
vi.mock("../features/devices/fermenter-binding", () => ({ listFermenterCandidates: mocks.listFermenterCandidates }));
vi.mock("../features/recipes/service", () => ({ getRecipeById: mocks.getRecipeById }));
vi.mock("../features/recipes/match-service", () => ({ computeRecipeMatch: mocks.computeRecipeMatch }));
vi.mock("../features/shopping/service", () => ({
  isShoppingGapLine: (line: { status?: string }) => line.status === "missing" || line.status === "partial"
}));
vi.mock("../features/brew-controller", () => ({ deviceChannel: () => null }));
vi.mock("../app/(app)/app/brew-batches/[id]/actions", () => ({
  addBrewMeasurementAction: vi.fn(),
  deleteBrewMeasurementAction: vi.fn(),
  setBrewMeasurementFinalAction: vi.fn(),
  updateBrewBatchNotesAction: vi.fn(),
  updateBrewBatchTastingNotesAction: vi.fn(),
  setBrewBatchPlannedForAction: vi.fn(),
  setBrewDayStepStateAction: vi.fn(),
  setBrewBatchStatusAction: vi.fn(),
  consumeBrewBatchInventoryAction: vi.fn(),
  restoreBrewBatchInventoryAction: vi.fn(),
  bindBatchFermenterAction: vi.fn()
}));
vi.mock("../features/brew-batches/components/brew-journal", () => ({
  BrewJournal: (props: Record<string, unknown>) => {
    mocks.journalProps.push(props);
    return React.createElement("section", null, String(props.title ?? "Журнал замеров"));
  }
}));
vi.mock("../features/brew-batches/components/fermentation-board", () => ({
  FermentationBoard: (props: Record<string, unknown>) => {
    mocks.fermentationProps.push(props);
    return React.createElement("section", null, "Брожение");
  },
  HERO_STEP_IDS: new Set(["ferment:primary"])
}));
// Блок «Брожение» (M2-C) — асинхронный серверный компонент (сам читает БД через
// readBatchFermentSeries/listAvailableStreamDevices); renderToStaticMarkup не умеет
// ждать вложенные async-компоненты (только верхний BrewBatchDetailPage резолвится
// вручную выше), поэтому мокаем целиком — проводка страницы это не проверяет.
vi.mock("../features/device-streams/components/batch-ferment-block", () => ({
  BatchFermentBlock: () => null
}));
// Клиентские блоки страницы (меню партии и т.п.) живут в роутере Next — при
// голом SSR-рендере его контекста нет.
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/app/brew-batches/bb-9",
  useSearchParams: () => new URLSearchParams()
}));

import BrewBatchesPage from "../app/(app)/app/brew-batches/page";
import BrewBatchDetailPage from "../app/(app)/app/brew-batches/[id]/page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.journalProps.length = 0;
  mocks.fermentationProps.length = 0;
  mocks.requireUser.mockResolvedValue({ id: "u-1", email: "brewer@example.com", displayName: "Brewer", preferredGravityUnit: "plato" as const });
  mocks.listBrewBatchesForUser.mockResolvedValue([]);
  mocks.getDeviceTelemetryHistory.mockResolvedValue([]);
  mocks.getBrewBatchInventoryView.mockResolvedValue(null);
  mocks.getDeviceById.mockResolvedValue(null);
  mocks.listFermenterCandidates.mockResolvedValue([]);
  mocks.computeRecipeMatch.mockResolvedValue({ lines: [] });
});

describe("Brew batches page", () => {
  it("offers the primary Сварить entry and a clean empty state when there are no brews", async () => {
    const html = renderToStaticMarkup(await BrewBatchesPage());

    expect(mocks.listBrewBatchesForUser).toHaveBeenCalledWith("u-1");
    expect(html).toContain("Сварить");
    expect(html).toContain("Пока нет ни одной партии.");
  });

  it("lists brew batches with statuses and links when non-empty", async () => {
    mocks.listBrewBatchesForUser.mockResolvedValue([plannedBrew, brewingBrew, completedBrew]);

    const html = renderToStaticMarkup(await BrewBatchesPage());

    expect(html).toContain("Сварить");
    expect(html).toContain("Planned Brew");
    expect(html).toContain("Brewing Brew");
    expect(html).toContain("Completed Brew");
    expect(html).toContain("Запланирована");
    expect(html).toContain("Варится");
    expect(html).toContain("Завершена");
    expect(html).toContain("№1");
    expect(html).toContain("№2");
    expect(html).toContain("№3");
    expect(html).toContain('href="/app/brew-batches/bb-1"');
    expect(html).toContain('href="/app/brew-batches/bb-2"');
    expect(html).toContain('href="/app/brew-batches/bb-3"');
  });

  it("sorts active statuses before completed ones", async () => {
    mocks.listBrewBatchesForUser.mockResolvedValue([completedBrew, plannedBrew, brewingBrew]);

    const html = renderToStaticMarkup(await BrewBatchesPage());

    const brewingIndex = html.indexOf("Brewing Brew");
    const plannedIndex = html.indexOf("Planned Brew");
    const completedIndex = html.indexOf("Completed Brew");
    expect(brewingIndex).toBeGreaterThan(-1);
    expect(plannedIndex).toBeGreaterThan(-1);
    expect(completedIndex).toBeGreaterThan(-1);
    expect(brewingIndex).toBeLessThan(plannedIndex);
    expect(plannedIndex).toBeLessThan(completedIndex);
  });
});

// --- Страница партии: композиция актов ---------------------------------------
// Раскладка страницы ветвится по акту (статусу), и до сих пор ни один тест не
// смотрел, ЧТО в каком акте рендерится. Так и проехали два дефекта: блок «Склад»
// выпал из акта «Итог» (A4), а подсказка плотности не зависела от контекста (A6).

const BATCH_ID = "bb-9";
const RECIPE_ID = "r-9";

const snapshot = (fermentationPlan: Record<string, unknown> | null = { primaryTemperatureC: 19, primaryDurationDays: 10 }) => ({
  version: "brew_plan_v1" as const,
  recipe: { id: RECIPE_ID, title: "Летний пилснер", versionNumber: 1, batchSizeL: 20 },
  equipmentProfileSnapshot: null,
  waterPlanMeta: null,
  mashSteps: [],
  boilPlan: { boilTimeMinutes: 60, timedAdditions: [] },
  whirlpoolPlan: [],
  dryHopPlan: [],
  fermentationPlan,
  packagingPlan: null,
  packagingAdditions: [],
  grainBillTotalKg: null,
  waterSchedule: null,
  deviceHints: []
});

const detail = (overrides: Record<string, unknown> = {}, batchOverrides: Record<string, unknown> = {}) => ({
  batch: {
    id: BATCH_ID,
    userId: "u-1",
    recipeId: RECIPE_ID,
    status: "completed",
    name: "Летний пилснер · партия 1",
    brewNumber: 1,
    deviceId: null,
    brewPlanSnapshot: snapshot(),
    brewDayProgress: { steps: {}, updatedAt: null },
    recipeSnapshot: { title: "Летний пилснер" },
    equipmentProfileSnapshot: null,
    waterPlanSnapshot: null,
    deviceHints: [],
    notes: "Затор держал 66 °C",
    tastingNotes: null,
    plannedFor: null,
    startedAt: new Date("2026-06-20T08:00:00Z"),
    completedAt: new Date("2026-07-04T08:00:00Z"),
    createdAt: new Date("2026-06-19T08:00:00Z"),
    updatedAt: new Date("2026-07-04T08:00:00Z"),
    ...batchOverrides
  },
  measurements: [],
  summary: { og: null, fg: null, abv: null, apparentAttenuation: null, target: { og: 1.052, fg: 1.012, abv: 5.2 } },
  ...overrides
});

const consumedInventoryView = {
  brewBatchId: BATCH_ID,
  recipeId: RECIPE_ID,
  hasConsumed: true,
  canRestore: true,
  batchAlreadyConsumed: true,
  consumed: [{ inventoryItemId: "ii-1", ingredientDisplayName: "Пильзнер", quantityNormalized: 4000, normalizedUnit: "g" }],
  log: [{
    id: "log-1",
    inventoryItemId: "ii-1",
    ingredientDisplayName: "Пильзнер",
    type: "consume" as const,
    quantityDeltaNormalized: -4000,
    normalizedUnit: "g",
    createdAt: new Date("2026-06-20T08:00:00Z")
  }]
};

// ToastProvider — карточка подготовки зовёт useToast (провайдер в приложении
// смонтирован в components/providers.tsx, при голом SSR его надо дать руками).
const renderDetail = async () => renderToStaticMarkup(
  React.createElement(ToastProvider, null, await BrewBatchDetailPage({ params: Promise.resolve({ id: BATCH_ID }) }))
);

describe("Страница партии — акт «Итог» (A4)", () => {
  beforeEach(() => {
    mocks.getBrewBatchDetail.mockResolvedValue(detail());
    mocks.getBrewBatchInventoryView.mockResolvedValue(consumedInventoryView);
  });

  it("показывает склад партии: что списано и историю движений", async () => {
    const html = await renderDetail();

    expect(html).toContain("Итог партии");
    expect(html).toContain("Склад");
    expect(html).toContain("Пильзнер");
    expect(html).toContain("История движений");
    expect(html).toContain("партия №1");
  });

  it("держит рядом два поля: «Заметки о варке» и «Дегустация»", async () => {
    const html = await renderDetail();

    expect(html).toContain("Заметки о варке");
    expect(html).toContain("Затор держал 66 °C");
    expect(html).toContain("Дегустация");
    expect(html).toContain('id="brew-notes"');
    expect(html).toContain('id="tasting-notes"');
    // Регресс A4: одна колонка notes больше не переименовывается в дегустацию.
    expect(html).not.toContain("Дегустационные заметки");
  });

  it("в итоге у поля плотности нет подсказки (A6)", async () => {
    await renderDetail();

    expect(mocks.journalProps.at(-1)?.measurementKind).toBe("any");
  });

  it("отменённая партия не предлагает дегустацию", async () => {
    mocks.getBrewBatchDetail.mockResolvedValue(detail({}, { status: "cancelled", completedAt: null }));

    const html = await renderDetail();

    expect(html).toContain("Варка отменена");
    expect(html).toContain("Заметки о варке");
    expect(html).not.toContain('id="tasting-notes"');
    // Склад остаётся доступным и в архиве — что списано и что вернулось.
    expect(html).toContain("История движений");
  });
});

describe("Страница партии — подсказка плотности по акту (A6)", () => {
  beforeEach(() => {
    mocks.getBrewBatchInventoryView.mockResolvedValue(null);
  });

  it("в варочный день журнал ждёт OG", async () => {
    mocks.getBrewBatchDetail.mockResolvedValue(detail({}, { status: "brewing", completedAt: null }));

    await renderDetail();

    expect(mocks.journalProps.at(-1)?.measurementKind).toBe("og");
    expect(mocks.journalProps.at(-1)?.title).toBe("Начальная плотность (OG)");
  });

  it("на брожении журнал ждёт FG", async () => {
    mocks.getBrewBatchDetail.mockResolvedValue(detail({}, { status: "fermenting", completedAt: null }));

    await renderDetail();

    expect(mocks.journalProps.at(-1)?.measurementKind).toBe("fg");
  });
});

describe("Страница партии — акт «Брожение» (B3)", () => {
  beforeEach(() => {
    mocks.getBrewBatchInventoryView.mockResolvedValue(null);
    mocks.getBrewBatchDetail.mockResolvedValue(detail({}, { status: "fermenting", completedAt: null }));
  });

  it("отдаёт доске брожения день и план числами, а не только строкой", async () => {
    await renderDetail();

    const props = mocks.fermentationProps.at(-1);
    expect(props?.plannedDays).toBe(10);
    expect(typeof props?.fermentDayN).toBe("number");
    expect(props?.fermentDayN as number).toBeGreaterThanOrEqual(1);
  });

  it("план без длительности → plannedDays = null (не «из null» в подтверждении)", async () => {
    mocks.getBrewBatchDetail.mockResolvedValue(
      detail({}, { status: "fermenting", completedAt: null, brewPlanSnapshot: snapshot(null) })
    );

    await renderDetail();

    expect(mocks.fermentationProps.at(-1)?.plannedDays).toBeNull();
  });
});

describe("Страница партии — акт «Подготовка» (A2)", () => {
  it("считает покрытие склада (Ф5) с учётом уже списанного на ЭТУ партию", async () => {
    mocks.getBrewBatchDetail.mockResolvedValue(detail({}, { status: "planned", startedAt: null, completedAt: null }));
    // Коверидж считается, только когда есть свой инвентарный вид партии и она
    // ещё не списала себя — пустой (не списанный) вид, как у свежей партии.
    mocks.getBrewBatchInventoryView.mockResolvedValue({
      brewBatchId: BATCH_ID,
      recipeId: RECIPE_ID,
      hasConsumed: false,
      canRestore: false,
      batchAlreadyConsumed: false,
      consumed: [],
      log: []
    });

    await renderDetail();

    expect(mocks.computeRecipeMatch).toHaveBeenCalledWith({
      userId: "u-1",
      recipeId: RECIPE_ID,
      brewBatchId: BATCH_ID
    });
  });

  it("не считает покрытие, когда партия уже списала себя (batchAlreadyConsumed)", async () => {
    mocks.getBrewBatchDetail.mockResolvedValue(detail({}, { status: "planned", startedAt: null, completedAt: null }));
    mocks.getBrewBatchInventoryView.mockResolvedValue({
      brewBatchId: BATCH_ID,
      recipeId: RECIPE_ID,
      hasConsumed: true,
      canRestore: true,
      batchAlreadyConsumed: true,
      consumed: [],
      log: []
    });

    await renderDetail();

    expect(mocks.computeRecipeMatch).not.toHaveBeenCalled();
  });

  it("не считает покрытие без своего инвентарного вида партии (getBrewBatchInventoryView → null)", async () => {
    mocks.getBrewBatchDetail.mockResolvedValue(detail({}, { status: "planned", startedAt: null, completedAt: null }));
    mocks.getBrewBatchInventoryView.mockResolvedValue(null);

    await renderDetail();

    expect(mocks.computeRecipeMatch).not.toHaveBeenCalled();
  });
});

// Находка 3: коверидж считался только на «Подготовке» (A2 покрывал только её) —
// регресс на то, что кнопка «Списать» знает про нехватку и в «Варочном дне», и на
// «Брожении» (акт не терминальный, кнопка там тоже видна).
describe("Страница партии — покрытие склада вне «Подготовки» (Находка 3)", () => {
  const liveInventoryView = {
    brewBatchId: BATCH_ID,
    recipeId: RECIPE_ID,
    hasConsumed: false,
    canRestore: false,
    batchAlreadyConsumed: false,
    consumed: [],
    log: []
  };

  beforeEach(() => {
    mocks.getBrewBatchInventoryView.mockResolvedValue(liveInventoryView);
  });

  it("считает покрытие в акте «Варочный день» (status brewing)", async () => {
    mocks.getBrewBatchDetail.mockResolvedValue(detail({}, { status: "brewing", startedAt: new Date("2026-07-01T08:00:00Z"), completedAt: null }));

    await renderDetail();

    expect(mocks.computeRecipeMatch).toHaveBeenCalledWith({
      userId: "u-1",
      recipeId: RECIPE_ID,
      brewBatchId: BATCH_ID
    });
  });

  it("считает покрытие в акте «Брожение» (status fermenting)", async () => {
    mocks.getBrewBatchDetail.mockResolvedValue(detail({}, { status: "fermenting", startedAt: new Date("2026-07-01T08:00:00Z"), completedAt: null }));

    await renderDetail();

    expect(mocks.computeRecipeMatch).toHaveBeenCalledWith({
      userId: "u-1",
      recipeId: RECIPE_ID,
      brewBatchId: BATCH_ID
    });
  });
});
