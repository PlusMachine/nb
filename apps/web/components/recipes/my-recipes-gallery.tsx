"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutGrid, List, Search } from "lucide-react";

import { Input } from "@nb/ui";

import type { OwnerRecipeCardDto, RecipeMatchDto, RecipePublicationState } from "@/features/recipes/contracts";
import { resolveBrewabilityBadge } from "@/features/recipes/brewability-badge";
import {
  mergeMyRecipesQuery,
  MY_RECIPES_VIEW_COOKIE,
  type SortMode,
  type StatusFilter,
  type ViewMode
} from "@/features/recipes/my-recipes-url";
import type { PreferredGravityUnit } from "@/features/system/gravity-units";

import { OwnerRecipeCard, OwnerRecipeRow } from "./owner-recipe-card";
import { RecipeMatchProvider, useRecipeMatches } from "./recipe-match-provider";
import { BrewPickerDialog } from "./brew-picker-dialog";

/**
 * Галерея «Мои рецепты» — клиентская обёртка над уже загруженными карточками
 * ({@link OwnerRecipeCardDto}). Фильтр/сортировка/вид живут в локальном стейте
 * (данные грузятся целиком, серверная пагинация/URL-фильтры как на `/recipes`
 * тут избыточны), но зеркалятся наружу для персистентности между заходами:
 * - вид (grid/list) — в cookie {@link MY_RECIPES_VIEW_COOKIE}, ровно в том же
 *   формате, что тулбар витрины `/recipes`;
 * - поиск/сортировка/статус — в query (`?q=`, `?sort=`, `?status=`) через
 *   `window.history.replaceState` (без навигации/серверного раунд-трипа —
 *   значения используются только для локальной фильтрации уже загруженного
 *   списка). Дефолты в URL не пишутся, посторонние параметры (в первую очередь
 *   `intent=brew`) сохраняются. `initialQuery`/`initialSort`/`initialStatus`/
 *   `initialView` — то, что сервер (`content.tsx`) уже распарсил из cookie/URL.
 * Полоса фильтров показывается, когда рецептов заметно много
 * ({@link TOOLBAR_THRESHOLD}) — или раньше, если поиск/статус/сортировка уже
 * недефолтны (например, пришли из URL): иначе пользователь с горсткой
 * рецептов и непустым `q`/`status` из ссылки увидел бы «Ничего не найдено»
 * без единого контрола, чтобы это исправить. При малом числе рецептов и
 * дефолтных контролах остаётся лишь переключатель grid/list. На мобиле
 * тулбар — 2 строки (поиск; затем сортировка + вид), на `sm` и шире — снова
 * одна строка.
 *
 * Режим `intent="brew"` — вход «Сварить» с дашборда/списка варок: карточки
 * становятся селекторами (клик открывает {@link BrewPickerDialog} по рецепту),
 * дефолтная сортировка — «сначала можно сварить» (доступна и в режиме
 * управления — просто не по умолчанию), фильтр статуса публикации скрыт
 * (варить можно и черновик). Пункт меню «Сварить» есть у карточки в обоих
 * режимах — {@link BrewPickerDialog} рендерится, когда выбран рецепт, вне
 * зависимости от `intent`.
 */

type GalleryIntent = "manage" | "brew";

/**
 * Порог числа рецептов, с которого появляется поиск/фильтр статуса/сортировка.
 * Не единственное условие показа — см. `showToolbar` в {@link RecipesGalleryInner}.
 */
const TOOLBAR_THRESHOLD = 6;

/**
 * Размер порции клиентской подгрузки — карточки рендерятся все сразу
 * (данные и так уже загружены целиком), но чтобы не рисовать десятки DOM-узлов
 * на мобиле одним махом, показываем их порциями по кнопке «Показать ещё».
 */
const PAGE_SIZE = 12;

const sortLabels: Record<SortMode, string> = {
  updated: "Сначала недавние",
  brewable: "Сначала можно сварить",
  name: "По названию",
  abv: "ABV ↓",
  ibu: "IBU ↓"
};

// Порядок опций сортировки различается по режиму: у каждого свой дефолт-первый
// пункт, но набор один и тот же — «можно сварить» доступно и в управлении, не
// только при варке (§3 ТЗ), просто не выбрано по умолчанию.
const sortOrderByIntent: Record<GalleryIntent, SortMode[]> = {
  manage: ["updated", "brewable", "name", "abv", "ibu"],
  brew: ["brewable", "updated", "name", "abv", "ibu"]
};

const matchesStatus = (state: RecipePublicationState, filter: StatusFilter): boolean => {
  if (filter === "all") {
    return true;
  }
  return filter === "published" ? state === "published" : state !== "published";
};

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (view: ViewMode) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card p-1" role="group" aria-label="Вид списка">
      <button
        type="button"
        aria-label="Сеткой"
        aria-pressed={view === "grid"}
        onClick={() => onChange("grid")}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
          view === "grid" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"
        }`}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Списком"
        aria-pressed={view === "list"}
        onClick={() => onChange("list")}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
          view === "list" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"
        }`}
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}

export function MyRecipesGallery({
  recipes,
  preferredGravityUnit,
  intent = "manage",
  initialView = "grid",
  initialQuery = "",
  initialSort,
  initialStatus = "all"
}: {
  recipes: OwnerRecipeCardDto[];
  preferredGravityUnit: PreferredGravityUnit;
  intent?: GalleryIntent;
  /** Запомненный в cookie вид — уже распарсенный сервером. */
  initialView?: ViewMode;
  /** Значение `?q=` — уже распарсенное сервером (мусор/отсутствие → `""`). */
  initialQuery?: string;
  /** Значение `?sort=` — уже распарсенное сервером; без него берётся дефолт режима. */
  initialSort?: SortMode;
  /** Значение `?status=` — уже распарсенное сервером (мусор/отсутствие → `"all"`). */
  initialStatus?: StatusFilter;
}) {
  return (
    <RecipeMatchProvider recipeIds={recipes.map((recipe) => recipe.id)}>
      <RecipesGalleryInner
        recipes={recipes}
        preferredGravityUnit={preferredGravityUnit}
        intent={intent}
        initialView={initialView}
        initialQuery={initialQuery}
        initialSort={initialSort}
        initialStatus={initialStatus}
      />
    </RecipeMatchProvider>
  );
}

/**
 * Ранг «готовности к варке» для сортировки brew-режима: меньше — выше в
 * списке. До загрузки матча (`getMatch` → `null`) все получают одинаковый
 * ранг, порядок держит вторичный ключ `updatedAt`; после загрузки список
 * пересобирается.
 *
 * Пустой состав (`totalLines <= 0`, обычно черновик без ингредиентов) получает
 * отдельный, самый нижний ранг: он не эквивалентен рецепту, для которого
 * матч посчитан, но по складу просто не хватает ингредиентов — пустой
 * черновик не должен стоять с ним вровень.
 */
export const brewabilityRank = (match: RecipeMatchDto | null): number => {
  if (!match) {
    return 3;
  }
  if (match.totalLines <= 0) {
    return 4;
  }
  const badge = resolveBrewabilityBadge(match);
  if (badge.tier === "ready") {
    return badge.qtyShort ? 1 : 0;
  }
  return badge.tier === "almost" ? 2 : 3;
};

/**
 * Чистая сортировка карточек владельца по выбранному режиму — вынесена из
 * `useMemo`, чтобы её можно было гонять в тестах напрямую с фейковым
 * `getMatch`: рендер через `renderToStaticMarkup` не запускает эффекты
 * {@link RecipeMatchProvider}, поэтому ветка `"brewable"` в компоненте
 * никогда не видит ненулевые матчи. Поведение не отличается от прежнего
 * инлайна: `"brewable"` — по {@link brewabilityRank} с вторичным ключом
 * `updatedAt` (сначала недавние), прочие режимы — как раньше. Возвращает
 * новый массив, исходный не мутирует.
 */
export const sortOwnerRecipeCards = (
  cards: OwnerRecipeCardDto[],
  sort: SortMode,
  getMatch: (id: string) => RecipeMatchDto | null
): OwnerRecipeCardDto[] =>
  [...cards].sort((left, right) => {
    switch (sort) {
      case "brewable": {
        const byRank = brewabilityRank(getMatch(left.id)) - brewabilityRank(getMatch(right.id));
        if (byRank !== 0) {
          return byRank;
        }
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      }
      case "name":
        return left.title.localeCompare(right.title, "ru");
      case "abv":
        return (right.abv ?? -Infinity) - (left.abv ?? -Infinity);
      case "ibu":
        return (right.ibu ?? -Infinity) - (left.ibu ?? -Infinity);
      default:
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    }
  });

function RecipesGalleryInner({
  recipes,
  preferredGravityUnit,
  intent,
  initialView,
  initialQuery,
  initialSort,
  initialStatus
}: {
  recipes: OwnerRecipeCardDto[];
  preferredGravityUnit: PreferredGravityUnit;
  intent: GalleryIntent;
  initialView: ViewMode;
  initialQuery: string;
  initialSort?: SortMode;
  initialStatus: StatusFilter;
}) {
  const brewMode = intent === "brew";
  const defaultSort: SortMode = brewMode ? "brewable" : "updated";
  const matchCtx = useRecipeMatches();
  const pathname = usePathname();

  const [view, setView] = useState<ViewMode>(initialView);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [sort, setSort] = useState<SortMode>(initialSort ?? defaultSort);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Выбранный для варки рецепт → открываем общий BrewPickerDialog.
  const [brewRecipe, setBrewRecipe] = useState<OwnerRecipeCardDto | null>(null);
  const [brewOpen, setBrewOpen] = useState(false);

  // Тулбар нужен и ниже порога, если поиск/статус/сортировка уже недефолтны
  // (пришли из URL) — иначе контролы для сброса просто не были бы показаны.
  const showToolbar =
    recipes.length > TOOLBAR_THRESHOLD || query.trim() !== "" || status !== "all" || sort !== defaultSort;

  const sortOptions = sortOrderByIntent[intent].map((value) => ({ value, label: sortLabels[value] }));

  const statusCounts = useMemo(() => {
    let published = 0;
    for (const recipe of recipes) {
      if (recipe.publicationState === "published") {
        published += 1;
      }
    }
    return { all: recipes.length, published, private: recipes.length - published };
  }, [recipes]);

  const statusOptions: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "Все", count: statusCounts.all },
    { value: "private", label: "Приватные", count: statusCounts.private },
    { value: "published", label: "Публичные", count: statusCounts.published }
  ];

  const getMatch = matchCtx?.getMatch;
  const matchReady = matchCtx?.ready ?? false;

  // Последние значения q/sort/status — читаются из debounce-таймера поиска,
  // которому не нужно пересоздаваться при каждом чужом изменении.
  const latestRef = useRef({ query, sort, status });
  useEffect(() => {
    latestRef.current = { query, sort, status };
  });

  // Зеркалит текущее q/sort/status в адресную строку через нативный History
  // API — без навигации Next (роут не перерисовывается, значения нужны только
  // для локальной фильтрации). Базируется на «живом» window.location.search,
  // поэтому посторонние параметры (в первую очередь `intent=brew`) не теряются.
  // Дефолтные значения (пустой q, sort текущего режима, status="all") в URL не
  // попадают.
  const syncUrl = useCallback(
    (next: { q: string; sort: SortMode; status: StatusFilter }) => {
      if (typeof window === "undefined") {
        return;
      }
      const qs = mergeMyRecipesQuery(window.location.search, next, defaultSort);
      const nextHref = qs ? `${pathname}?${qs}` : pathname;
      const currentHref = `${window.location.pathname}${window.location.search}`;
      if (currentHref === nextHref) {
        return;
      }
      // `null` первым аргументом — history-запись не создаётся заново, а
      // Next.js просто подхватывает уже актуальный URL в своём внутреннем
      // состоянии роутера, без навигации и без перезагрузки страницы.
      window.history.replaceState(null, "", nextHref);
    },
    [pathname, defaultSort]
  );

  const searchDebounceRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (searchDebounceRef.current != null) {
        window.clearTimeout(searchDebounceRef.current);
      }
    },
    []
  );

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (searchDebounceRef.current != null) {
      window.clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = window.setTimeout(() => {
      searchDebounceRef.current = null;
      syncUrl({ q: value, sort: latestRef.current.sort, status: latestRef.current.status });
    }, 300);
  };

  // Немедленно досрочно выполняет отложенный синк URL — вешается на blur поля
  // поиска. Без этого возможна гонка: пользователь вводит текст и тут же (до
  // истечения 300мс) кликает по ссылке/карточке, запускающей мягкую навигацию
  // Next.js; если debounce-таймер срабатывает уже ПОСЛЕ старта перехода, его
  // `replaceState` затирает URL, на который Next уже переходит, и переход
  // фактически отменяется (наблюдалось: клик «К рецептам» при выходе из
  // brew-режима не срабатывал). Клик по любому элементу сперва снимает фокус
  // с инпута, поэтому blur успевает выполнить синк синхронно ДО навигации.
  const flushSearchSync = useCallback(() => {
    if (searchDebounceRef.current == null) {
      return;
    }
    window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = null;
    syncUrl({ q: latestRef.current.query, sort: latestRef.current.sort, status: latestRef.current.status });
  }, [syncUrl]);

  const handleSortChange = (value: SortMode) => {
    setSort(value);
    syncUrl({ q: latestRef.current.query, sort: value, status: latestRef.current.status });
  };

  const handleStatusChange = (value: StatusFilter) => {
    setStatus(value);
    syncUrl({ q: latestRef.current.query, sort: latestRef.current.sort, status: value });
  };

  const selectView = (next: ViewMode) => {
    document.cookie = `${MY_RECIPES_VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    setView(next);
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = recipes.filter((recipe) => {
      // Статус публикации фильтруем только в режиме управления — варить можно и черновик.
      if (!brewMode && !matchesStatus(recipe.publicationState, status)) {
        return false;
      }
      if (needle === "") {
        return true;
      }
      return (
        recipe.title.toLowerCase().includes(needle) ||
        (recipe.styleName?.toLowerCase().includes(needle) ?? false)
      );
    });

    return sortOwnerRecipeCards(filtered, sort, (id) => getMatch?.(id) ?? null);
    // matchReady в зависимостях: пересортировать, когда матч склад↔рецепт догрузился.
  }, [recipes, query, status, sort, brewMode, getMatch, matchReady]);

  // Смена поиска/статуса/сортировки меняет набор результатов — начинаем
  // подгрузку заново, иначе кнопка «Показать ещё» могла бы остаться в
  // «раскрытом» состоянии для совсем другого списка.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, status, sort]);

  const shown = visible.slice(0, visibleCount);
  const hasMore = visible.length > shown.length;

  const handleBrew = (recipe: OwnerRecipeCardDto) => {
    setBrewRecipe(recipe);
    setBrewOpen(true);
  };

  return (
    <div className="space-y-4">
      {showToolbar ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <label htmlFor="my-recipes-search" className="sr-only">
                Поиск по рецептам
              </label>
              <Input
                id="my-recipes-search"
                type="search"
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
                onBlur={flushSearchSync}
                placeholder="Поиск по названию или стилю"
                className="pl-9"
              />
            </div>

            {/* На мобиле — вторая строка (сортировка + вид); на `sm+` `contents`
                убирает эту обёртку из потока, и оба элемента становятся прямыми
                элементами верхнего flex-row, как и было раньше. */}
            <div className="flex items-center gap-3 sm:contents">
              <label htmlFor="my-recipes-sort" className="sr-only">
                Сортировка
              </label>
              <select
                id="my-recipes-sort"
                value={sort}
                onChange={(event) => handleSortChange(event.target.value as SortMode)}
                className="h-10 flex-1 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:flex-none"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <ViewToggle view={view} onChange={selectView} />
            </div>
          </div>

          {brewMode ? null : (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Фильтр по статусу">
              {statusOptions.map((option) => {
                const active = status === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleStatusChange(option.value)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                      active
                        ? "bg-foreground text-background"
                        : "border border-border bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {option.label}
                    <span className={active ? "text-background/70" : "text-muted-foreground"}>{option.count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex justify-end">
          <ViewToggle view={view} onChange={selectView} />
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted p-6 text-center text-sm text-muted-foreground">
          Ничего не найдено. Измените поиск{brewMode ? "" : " или фильтр статуса"}.
        </p>
      ) : view === "list" ? (
        <div className="flex flex-col gap-3">
          {shown.map((recipe) => (
            <OwnerRecipeRow
              key={recipe.id}
              recipe={recipe}
              preferredGravityUnit={preferredGravityUnit}
              intent={intent}
              onBrew={handleBrew}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {shown.map((recipe) => (
            <OwnerRecipeCard
              key={recipe.id}
              recipe={recipe}
              preferredGravityUnit={preferredGravityUnit}
              intent={intent}
              onBrew={handleBrew}
            />
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Показать ещё
          </button>
        </div>
      ) : null}

      {brewRecipe ? (
        <BrewPickerDialog
          open={brewOpen}
          onOpenChange={setBrewOpen}
          recipeId={brewRecipe.id}
          recipeTitle={brewRecipe.title}
        />
      ) : null}
    </div>
  );
}
