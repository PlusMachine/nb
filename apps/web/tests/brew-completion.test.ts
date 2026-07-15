import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Доска брожения — клиентский компонент поверх server actions: мокаем экшены,
// иначе импорт утянет db-слой. Кнопку перехода подменяем шпионом: подтверждение
// живёт в закрытом Dialog, в статичной разметке его текста нет — проверяем сам
// факт, что confirm передан. (Файл .ts → рендерим через createElement.)
const transitionProps: Record<string, unknown>[] = [];

vi.mock("@/app/(app)/app/brew-batches/[id]/actions", () => ({
  setBrewDayStepStateAction: vi.fn(async () => ({ ok: true, message: "ok", progress: { steps: {} } })),
  setBrewBatchStatusAction: vi.fn(async () => ({ ok: true, message: "ok" }))
}));

vi.mock("../features/brew-batches/components/brew-transition-button", () => ({
  BrewTransitionButton: (props: Record<string, unknown>) => {
    transitionProps.push(props);
    return React.createElement("button", { type: "button" }, String(props.label));
  }
}));

import { resolveBrewCompletionRatingSlug } from "../features/brew-batches/completion";
// buildFinishBrewConfirm живёт в brew-day.ts, а не в completion.ts: последний через
// recipes/visibility тянет @nb/db (pg → fs), и клиентская доска брожения с таким
// импортом роняет сборку страницы. Тесты обеих функций держим рядом — это одна тема.
import { buildFinishBrewConfirm } from "../features/brew-batches/brew-day";
import { FermentationBoard } from "../features/brew-batches/components/fermentation-board";
import { emptyBrewDayProgress } from "../features/brew-batches/contracts";

const OWNER = "user-1";
const OTHER = "user-2";

const candidate = (
  overrides: Partial<{ authorId: string; publicationState: string; hiddenAt: Date | null; slug: string }> = {}
) => ({
  authorId: OTHER,
  publicationState: "published",
  hiddenAt: null,
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

// --- Подтверждение завершения варки (B3) --------------------------------------
// «Завершить варку» на 1-м дне брожения из 10 срабатывала одним кликом: подтверждение
// показывалось, только когда в акте оставались неотмеченные шаги, а у типового рецепта
// единственный шаг брожения — это герой «день N из M», и он из списка исключён.

describe("buildFinishBrewConfirm", () => {
  it("честно называет день и остаток плана при раннем завершении", () => {
    const confirm = buildFinishBrewConfirm({ fermentDayN: 1, plannedDays: 10, undoneSteps: 0 });

    expect(confirm.title).toBe("Завершить варку?");
    expect(confirm.description).toContain("день 1 из 10");
    expect(confirm.description).toContain("ещё 9 дней");
    expect(confirm.tone).toBe("danger");
  });

  it("склоняет остаток дней", () => {
    expect(buildFinishBrewConfirm({ fermentDayN: 9, plannedDays: 10, undoneSteps: 0 }).description).toContain("ещё 1 день");
    expect(buildFinishBrewConfirm({ fermentDayN: 8, plannedDays: 10, undoneSteps: 0 }).description).toContain("ещё 2 дня");
  });

  it("брожение дольше плана — спокойный тон, формулировка «дольше плана»", () => {
    const confirm = buildFinishBrewConfirm({ fermentDayN: 12, plannedDays: 10, undoneSteps: 0 });

    expect(confirm.description).toContain("день 12 — дольше плана (10 дней)");
    expect(confirm.description).not.toContain("по плану ещё");
    expect(confirm.description).not.toContain("из 10");
    expect(confirm.tone).toBe("primary");
  });

  it("без плановой длительности (старые партии) — «День N» без «из null»", () => {
    const confirm = buildFinishBrewConfirm({ fermentDayN: 3, plannedDays: null, undoneSteps: 0 });

    expect(confirm.description).toContain("день 3");
    expect(confirm.description).not.toMatch(/день 3 из/);
    expect(confirm.description).not.toContain("null");
    expect(confirm.tone).toBe("primary");
  });

  it("упоминает неотмеченные шаги, когда они есть", () => {
    const confirm = buildFinishBrewConfirm({ fermentDayN: 14, plannedDays: 14, undoneSteps: 2 });

    expect(confirm.description).toContain("Не отмечено 2 шага");
  });

  it("всегда напоминает, что этап обратим", () => {
    for (const undoneSteps of [0, 3]) {
      for (const plannedDays of [null, 14]) {
        const confirm = buildFinishBrewConfirm({ fermentDayN: 5, plannedDays, undoneSteps });
        expect(confirm.description).toContain("Изменить этап");
      }
    }
  });
});

describe("FermentationBoard — кнопка «Завершить варку»", () => {
  const render = (props: { fermentDayN: number | null; plannedDays: number | null }) => {
    transitionProps.length = 0;
    const html = renderToStaticMarkup(
      React.createElement(FermentationBoard, {
        brewBatchId: "bb-1",
        groups: [],
        initialProgress: emptyBrewDayProgress,
        dayLabel: "День 1 из 10",
        targetTempLabel: "19 °C",
        nudge: null,
        ...props
      })
    );
    return { html, confirm: transitionProps[0]?.confirm as { description: string; tone: string } | null };
  };

  it("спрашивает подтверждение даже когда шагов брожения нет (регресс B3)", () => {
    const { confirm } = render({ fermentDayN: 1, plannedDays: 10 });

    expect(confirm).toBeTruthy();
    expect(confirm?.description).toContain("день 1 из 10");
    expect(confirm?.tone).toBe("danger");
  });

  it("на завершении по плану подтверждение остаётся, но тон спокойный", () => {
    const { confirm } = render({ fermentDayN: 14, plannedDays: 14 });

    expect(confirm).toBeTruthy();
    expect(confirm?.tone).toBe("primary");
  });

  it("раннее завершение не выглядит основным путём (кнопка не primary)", () => {
    render({ fermentDayN: 1, plannedDays: 10 });
    expect(transitionProps[0]?.variant).toBe("outline");

    render({ fermentDayN: 14, plannedDays: 14 });
    expect(transitionProps[0]?.variant).toBe("primary");
  });
});
