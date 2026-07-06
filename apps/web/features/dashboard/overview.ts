import type { ActiveBrewProgressItem } from "../brew-batches/contracts";
import { resolveBrewNudge, type BrewNudge } from "../brew-batches/dashboard";

// Чистая сборка данных для виджетов дашборда /app. Без БД/React и без чтения
// текущего времени — `now` передаётся снаружи, чтобы логика была
// детерминирована и покрывалась тестами без рендера страницы.

export type DashboardBrewCard = {
  batch: ActiveBrewProgressItem;
  nudge: BrewNudge;
  /** День брожения (1-based), только для статуса fermenting. */
  fermentationDay: number | null;
};

export type DashboardBrewSplit = {
  /** Варки, которые идут или требуют действия: brewing, fermenting, просроченные planned. */
  attention: DashboardBrewCard[];
  /** Остальные запланированные — компактный список, а не карточки. */
  planned: ActiveBrewProgressItem[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

const nudgeToneOrder: Record<BrewNudge["tone"], number> = { action: 0, warn: 1, info: 2 };

const fermentationDayNumber = (batch: ActiveBrewProgressItem, now: Date): number | null => {
  if (batch.status !== "fermenting") {
    return null;
  }
  const since = batch.startedAt ?? batch.createdAt;
  return Math.max(Math.floor((now.getTime() - since.getTime()) / DAY_MS), 0) + 1;
};

/**
 * Делит активные варки на «в работе» (карточки с подсказкой, по убыванию
 * срочности) и «запланированы» (компактные строки, ближайшая дата первой).
 * Просроченная planned (nudge-тон action, «пора начинать») поднимается в
 * «в работе» — ей нужно действие, а не место в очереди.
 */
export const splitActiveBrews = (items: ActiveBrewProgressItem[], now: Date): DashboardBrewSplit => {
  const attention: DashboardBrewCard[] = [];
  const planned: ActiveBrewProgressItem[] = [];

  for (const batch of items) {
    const nudge = resolveBrewNudge(batch, now);
    if (batch.status === "planned" && nudge.tone !== "action") {
      planned.push(batch);
      continue;
    }
    attention.push({ batch, nudge, fermentationDay: fermentationDayNumber(batch, now) });
  }

  attention.sort((a, b) => {
    const byTone = nudgeToneOrder[a.nudge.tone] - nudgeToneOrder[b.nudge.tone];
    return byTone !== 0 ? byTone : b.batch.createdAt.getTime() - a.batch.createdAt.getTime();
  });

  planned.sort((a, b) => {
    if (a.plannedFor && b.plannedFor) {
      return a.plannedFor.getTime() - b.plannedFor.getTime();
    }
    if (a.plannedFor || b.plannedFor) {
      return a.plannedFor ? -1 : 1;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return { attention, planned };
};

// --- Чеклист первого круга -----------------------------------------------------

export type OnboardingStepKey = "stock" | "recipe" | "brew";

export type OnboardingStepLink = { href: string; label: string };

export type OnboardingStep = {
  key: OnboardingStepKey;
  title: string;
  done: boolean;
  links: OnboardingStepLink[];
};

export type DashboardOnboardingStepsInput = {
  inventoryTotalItems: number;
  recipeCount: number;
  savedRecipeCount: number;
  brewBatchCount: number;
};

export type DashboardOnboarding = {
  steps: OnboardingStep[];
  complete: boolean;
  /** Первый непройденный шаг — его чеклист подсвечивает как текущий. */
  currentKey: OnboardingStepKey | null;
};

/**
 * Прогресс первого круга склад → рецепт → варка. Чеклист живёт на дашборде,
 * пока круг не замкнут, и целиком исчезает после первой варки. Сохранённый
 * чужой рецепт закрывает шаг «рецепт» наравне со своим — варить можно любой.
 */
export const buildDashboardOnboarding = ({
  inventoryTotalItems,
  recipeCount,
  savedRecipeCount,
  brewBatchCount
}: DashboardOnboardingStepsInput): DashboardOnboarding => {
  const steps: OnboardingStep[] = [
    {
      key: "stock",
      title: "Пополните склад",
      done: inventoryTotalItems > 0,
      links: [
        { href: "/catalog", label: "Каталог" },
        { href: "/app/ingredients", label: "Склад" }
      ]
    },
    {
      key: "recipe",
      title: "Найдите или создайте рецепт",
      done: recipeCount + savedRecipeCount > 0,
      links: [
        { href: "/recipes", label: "Рецепты сообщества" },
        { href: "/app/recipes/new", label: "Создать свой" }
      ]
    },
    {
      key: "brew",
      title: "Запустите первую варку",
      done: brewBatchCount > 0,
      links: [{ href: "/app/recipes", label: "Мои рецепты" }]
    }
  ];

  const complete = steps.every((step) => step.done);
  const currentKey = steps.find((step) => !step.done)?.key ?? null;

  return { steps, complete, currentKey };
};
