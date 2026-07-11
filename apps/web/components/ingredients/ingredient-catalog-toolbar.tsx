"use client";

import { useCallback, useEffect, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  Check,
  Loader2,
  Plus,
  RotateCcw
} from "lucide-react";

import { DropdownMenu, type DropdownMenuItem } from "@nb/ui";
import type {
  IngredientCatalogSortOption,
  IngredientCatalogView,
  IngredientCategory
} from "@/features/ingredients/contracts";
import type { ConsumableInventoryBroadGroupValue } from "@/features/ingredients/consumables";
import { ingredientCategoryLabels } from "@/features/ingredients/presentation";
import { useDebouncedUrlSearch } from "@/components/shared/use-debounced-url-search";
import { categoryMeta } from "@/components/ingredients/catalog-category-meta";

type Props = {
  view: IngredientCatalogView;
  q: string;
  category: IngredientCategory | "all";
  subtype: "malt" | "fermentable" | null;
  // Broad group расходников (специи/добавки vs расходники) — задан только на
  // соответствующих лендингах (/catalog/additives, /catalog/consumables), как
  // subtype для fermentable. См. resolveConsumableInventoryBroadGroup в
  // features/ingredients/consumables.ts.
  consumableGroup?: ConsumableInventoryBroadGroupValue | null;
  sort: IngredientCatalogSortOption;
  canManage: boolean;
  // Базовый путь для query-URL (поиск/сортировка/сброс/табы): всегда "/catalog",
  // а не usePathname() — иначе на категорийном лендинге (/catalog/hops) эти
  // контролы строили бы неверный путь вида "/catalog/hops?category=hop".
  queryBasePath: string;
  // Хаб (/catalog без лендинга) сортировки не показывает — секции уже
  // отсортированы по алфавиту/релевантности, параметр sort там не применяется.
  // См. notes/catalog-hub-redesign.md, S2.
  showSort?: boolean;
  counts: {
    total: number;
    customCount: number;
    catalogCount: number;
    byCategory: Record<IngredientCategory, number>;
    byFermentableSubtype: {
      malt: number;
      fermentable: number;
    };
    byConsumableGroup: {
      additives: number;
      supplies: number;
    };
  };
};

const sortLabels: Record<IngredientCatalogSortOption, string> = {
  name: "По названию",
  updated: "По обновлению",
  category: "По категории",
  brand: "По бренду",
  alpha: "По альфа-кислоте",
  color: "По цвету (EBC)",
  attenuation: "По аттенюации"
};

const defaultCatalogSortOption: IngredientCatalogSortOption = "name";
const searchDebounceMs = 250;

// Path-урлы категорийных лендингов (features/ingredients/seo.ts, catalogCategoryLandings).
// Ключи совпадают с button.key в primaryButtons ниже. consumable расщеплён на
// две broad group (см. resolveConsumableInventoryBroadGroup) — как malt/fermentable
// у fermentable.
const categoryLandingPaths: Record<
  "malt" | "fermentable" | "hop" | "yeast" | "water_treatment" | "consumable_additive" | "consumable_supply",
  string
> = {
  malt: "/catalog/malts",
  fermentable: "/catalog/fermentables",
  hop: "/catalog/hops",
  yeast: "/catalog/yeast",
  water_treatment: "/catalog/water",
  consumable_additive: "/catalog/additives",
  consumable_supply: "/catalog/consumables"
};

const buildCatalogHref = (
  pathname: string,
  params: {
    view: IngredientCatalogView;
    q: string;
    category: IngredientCategory | "all";
    subtype: "malt" | "fermentable" | null;
    sort: IngredientCatalogSortOption;
  }
) => {
  const searchParams = new URLSearchParams();

  if (params.view !== "all") {
    searchParams.set("view", params.view);
  }

  if (params.q.trim()) {
    searchParams.set("q", params.q.trim());
  }

  if (params.category !== "all") {
    searchParams.set("category", params.category);
  }

  if (params.subtype) {
    searchParams.set("subtype", params.subtype);
  }

  if (params.sort !== "name") {
    searchParams.set("sort", params.sort);
  }

  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
};

// Путь категорийного лендинга по category/subtype/consumableGroup: null —
// категория "all" (хаб) либо неоднозначный fermentable без subtype/consumable
// без группы (собственный лендинг есть только у malt/fermentable и
// additives/consumables-версий, см. categoryLandingPaths).
export const resolveLandingPath = (
  targetCategory: IngredientCategory | "all",
  targetSubtype: "malt" | "fermentable" | null,
  targetConsumableGroup?: ConsumableInventoryBroadGroupValue | null
): string | null => {
  if (targetCategory === "all") {
    return null;
  }

  if (targetCategory === "fermentable") {
    return targetSubtype ? categoryLandingPaths[targetSubtype] : null;
  }

  if (targetCategory === "consumable") {
    return targetConsumableGroup
      ? categoryLandingPaths[targetConsumableGroup === "inventory_additives" ? "consumable_additive" : "consumable_supply"]
      : null;
  }

  return categoryLandingPaths[targetCategory];
};

// Href для поиска/сортировки в ТЕКУЩЕМ контексте (категория/подтип не
// меняются): на лендинге (landingPath задан) — прямо на его путь, БЕЗ
// category/subtype в query — категория уже зашита в путь, а параметр
// ?category= тут писать нельзя: легаси-редирект в app/(public)/catalog/page.tsx
// ловит любой ?category= и уводит обратно на этот же лендинг, т.е. каждый ввод
// в поиск (после дебаунса) и каждая смена сортировки давали бы лишний 308 —
// двойной round-trip вместо одного (см. notes/catalog-hub-redesign.md,
// регрессия P1). На хабе (landingPath === null) — обычный buildCatalogHref
// с ?category= в query, как раньше.
export const buildContextualHref = (
  landingPath: string | null,
  hubBasePath: string,
  params: {
    view: IngredientCatalogView;
    q: string;
    category: IngredientCategory | "all";
    subtype: "malt" | "fermentable" | null;
    sort: IngredientCatalogSortOption;
  }
) => (
  landingPath
    ? buildCatalogHref(landingPath, { ...params, category: "all", subtype: null })
    : buildCatalogHref(hubBasePath, params)
);

const buildCreateCustomIngredientHref = (
  params: {
    category: IngredientCategory | "all";
    subtype: "malt" | "fermentable" | null;
  }
) => {
  const searchParams = new URLSearchParams();

  if (params.category !== "all") {
    searchParams.set("category", params.category);
  }

  if (params.category === "fermentable" && params.subtype) {
    searchParams.set("subtype", params.subtype);
  }

  const query = searchParams.toString();
  return query ? `/catalog/new?${query}` : "/catalog/new";
};

// Параметрические сортировки имеют смысл только при соответствующей активной
// категории — если целевая категория pill'а не поддерживает текущую
// параметрическую сортировку, ссылка сбрасывает sort на дефолт (этап 3.4/3.5).
const isSortValidForCategory = (value: IngredientCatalogSortOption, targetCategory: IngredientCategory | "all") => {
  if (value === "alpha") {
    return targetCategory === "hop";
  }

  if (value === "color") {
    return targetCategory === "fermentable";
  }

  if (value === "attenuation") {
    return targetCategory === "yeast";
  }

  return true;
};

export function IngredientCatalogToolbar({
  view,
  q,
  category,
  subtype,
  consumableGroup = null,
  sort,
  canManage,
  queryBasePath,
  showSort = true,
  counts
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Путь лендинга по текущим category/subtype/consumableGroup (props) — нужен
  // ниже для href поиска/сортировки и для pill «Мои» (currentLandingPath).
  // Вычисляем один раз здесь, а не через find по primaryButtons (как раньше
  // для currentLandingPath): нужен раньше по порядку кода — buildSearchHref и
  // currentHref строятся до объявления primaryButtons.
  const landingPath = useMemo(
    () => resolveLandingPath(category, subtype, consumableGroup),
    [category, subtype, consumableGroup]
  );

  const currentHref = useMemo(() => buildContextualHref(landingPath, queryBasePath, {
    view,
    q,
    category,
    subtype,
    sort
  }), [category, landingPath, queryBasePath, q, sort, subtype, view]);

  const replaceHref = useCallback((href: string) => {
    if (href === currentHref) {
      return;
    }

    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }, [currentHref, router]);

  const buildSearchHref = useCallback((nextQ: string) => buildContextualHref(landingPath, queryBasePath, {
    view,
    q: nextQ,
    category,
    subtype,
    sort
  }), [category, landingPath, queryBasePath, sort, subtype, view]);

  const {
    inputValue: searchValue,
    setInputValue: setSearchValue,
    isPending: isSearchPending,
    onFocus: handleSearchFocus,
    onBlur: handleSearchBlur
  } = useDebouncedUrlSearch({ value: q, buildHref: buildSearchHref, debounceMs: searchDebounceMs });

  // Пока идёт поиск/смена фильтра — помечаем документ, чтобы серверный сиблинг
  // (список каталога) погас через CSS: устаревшие строки не выглядят зависшими
  // (UX-находка #17). Атрибут снимаем по завершении и при размонтировании.
  const searching = isPending || isSearchPending;
  useEffect(() => {
    const root = document.documentElement;
    if (searching) {
      root.dataset.catalogSearching = "1";
    } else {
      delete root.dataset.catalogSearching;
    }
    return () => {
      delete root.dataset.catalogSearching;
    };
  }, [searching]);

  const replaceWith = (next: {
    view?: IngredientCatalogView;
    category?: IngredientCategory | "all";
    subtype?: "malt" | "fermentable" | null;
    sort?: IngredientCatalogSortOption;
  }) => {
    const nextCategory = next.category ?? category;
    const nextSubtype = next.subtype !== undefined ? next.subtype : subtype;
    // Категория/подтип здесь тоже могут меняться (на будущее — сейчас replaceWith
    // зовут только со сменой sort), поэтому путь лендинга пересчитываем от
    // эффективных next-значений, а не берём внешний landingPath. consumableGroup
    // replaceWith не меняет (нет такого сценария) — берём текущий.
    replaceHref(buildContextualHref(resolveLandingPath(nextCategory, nextSubtype, consumableGroup), queryBasePath, {
      view: next.view ?? view,
      q: searchValue,
      category: nextCategory,
      subtype: nextSubtype,
      sort: next.sort ?? sort
    }));
  };

  // Ссылки pill'ов категорий ведут на path-лендинги (/catalog/hops и т.п.), а не
  // строят query здесь — только q/sort/view цепляются как query-параметры, чтобы
  // активный поиск/сортировка/«Мои» не терялись при переходе между категориями.
  const buildLandingHref = (
    path: string,
    overrides?: { view?: IngredientCatalogView; targetCategory?: IngredientCategory | "all" }
  ) => {
    const landingSearchParams = new URLSearchParams();
    const nextView = overrides?.view ?? view;
    if (nextView !== "all") {
      landingSearchParams.set("view", nextView);
    }
    if (searchValue.trim()) {
      landingSearchParams.set("q", searchValue.trim());
    }
    const targetCategory = overrides?.targetCategory ?? category;
    const nextSort = isSortValidForCategory(sort, targetCategory) ? sort : defaultCatalogSortOption;
    if (nextSort !== defaultCatalogSortOption) {
      landingSearchParams.set("sort", nextSort);
    }
    const query = landingSearchParams.toString();
    return query ? `${path}?${query}` : path;
  };

  const hasFilters = Boolean(searchValue.trim()) || category !== "all" || subtype !== null || sort !== defaultCatalogSortOption;

  const primaryButtons = [
    {
      key: "malt",
      label: "Солод",
      category: "fermentable",
      count: counts.byFermentableSubtype.malt,
      active: category === "fermentable" && subtype === "malt",
      meta: categoryMeta.fermentable
    },
    {
      key: "fermentable",
      label: "Сбраживаемое сырье",
      category: "fermentable",
      count: counts.byFermentableSubtype.fermentable,
      active: category === "fermentable" && subtype === "fermentable",
      meta: categoryMeta.fermentable
    },
    {
      key: "hop",
      label: ingredientCategoryLabels.hop,
      category: "hop",
      count: counts.byCategory.hop,
      active: category === "hop" && subtype === null,
      meta: categoryMeta.hop
    },
    {
      key: "yeast",
      label: ingredientCategoryLabels.yeast,
      category: "yeast",
      count: counts.byCategory.yeast,
      active: category === "yeast" && subtype === null,
      meta: categoryMeta.yeast
    },
    {
      key: "water_treatment",
      label: ingredientCategoryLabels.water_treatment,
      category: "water_treatment",
      count: counts.byCategory.water_treatment,
      active: category === "water_treatment" && subtype === null,
      meta: categoryMeta.water_treatment
    },
    {
      key: "consumable_additive",
      label: "Специи и добавки",
      category: "consumable",
      count: counts.byConsumableGroup.additives,
      active: category === "consumable" && consumableGroup === "inventory_additives",
      meta: categoryMeta.consumable
    },
    {
      key: "consumable_supply",
      label: "Расходники",
      category: "consumable",
      count: counts.byConsumableGroup.supplies,
      active: category === "consumable" && consumableGroup === "inventory_supplies",
      meta: categoryMeta.consumable
    }
  ] as const;

  // Путь текущей активной категории — нужен, чтобы pill «Мои» переключал view,
  // сохраняя категорию (а не сбрасывал её на «Все»).
  const currentLandingPath = landingPath ?? "/catalog";

  // Список сортировок зависит от роли и активной категории: «По обновлению» —
  // только залогиненным, параметрическая сортировка — только при подходящей
  // категории (этап 3.5).
  const sortOptionsForCategory = useMemo(() => {
    const options: IngredientCatalogSortOption[] = ["name"];
    if (canManage) {
      options.push("updated");
    }
    options.push("category", "brand");
    if (category === "hop") {
      options.push("alpha");
    } else if (category === "fermentable") {
      options.push("color");
    } else if (category === "yeast") {
      options.push("attenuation");
    }
    return options;
  }, [canManage, category]);

  const pillClassName = (active: boolean, activeClasses: string) => (
    `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-sm font-medium transition-colors ${active
      ? activeClasses
      : "border-border bg-card text-muted-foreground hover:border-border hover:bg-muted"
    }`
  );

  return (
    <section className="space-y-3 rounded-[28px] border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            onFocus={handleSearchFocus}
            onBlur={handleSearchBlur}
            className="h-11 w-full rounded-xl border border-border bg-muted px-4 pr-10 text-sm"
            placeholder="Поиск по каталогу"
          />
          {/* Индикатор обновления внутри поля: отдельная строка текста меняла
              высоту тулбара на каждый ввод (28px layout shift). */}
          {isPending || isSearchPending ? (
            <span role="status" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="sr-only">Обновляем каталог…</span>
            </span>
          ) : null}
        </div>

        {showSort ? (
          <DropdownMenu
            trigger={
              <button
                type="button"
                aria-label="Сортировка"
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${sort !== defaultCatalogSortOption
                  ? "border-link/30 bg-muted text-link"
                  : "border-border bg-muted text-muted-foreground hover:border-border hover:bg-card"
                }`}
              >
                <ArrowUpDown className="h-4 w-4" />
              </button>
            }
            items={sortOptionsForCategory.map((option): DropdownMenuItem => ({
              key: option,
              label: sortLabels[option],
              icon: option === sort ? <Check className="h-3.5 w-3.5 text-link" /> : undefined,
              onSelect: () => replaceWith({ sort: option })
            }))}
            aria-label="Сортировка"
          />
        ) : null}

        <button
          type="button"
          disabled={!hasFilters}
          aria-disabled={!hasFilters}
          aria-label="Сбросить"
          onClick={() => {
            setSearchValue("");
            replaceHref(buildCatalogHref(queryBasePath, {
              view,
              q: "",
              category: "all",
              subtype: null,
              sort: defaultCatalogSortOption
            }));
          }}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${hasFilters
            ? "border-border bg-card text-muted-foreground hover:border-border hover:bg-muted"
            : "cursor-not-allowed border-border bg-muted text-muted-foreground/60"
          }`}
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        {canManage ? (
          <Link
            href={buildCreateCustomIngredientHref({ category, subtype })}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Создать свой</span>
          </Link>
        ) : null}
      </div>

      {/* На мобиле ряд pills скроллится горизонтально; на lg+ переносится,
          иначе хвост ряда (Расходники, Мои) уезжает за край без скроллбара. */}
      <div className="-mx-5 overflow-x-auto px-5 scrollbar-none lg:mx-0 lg:overflow-visible lg:px-0">
        <div className="flex gap-2 lg:flex-wrap">
          <Link
            href={buildLandingHref("/catalog", { targetCategory: "all" })}
            className={pillClassName(category === "all", "border-transparent bg-foreground text-background")}
          >
            Все
            <span className="tabular-nums text-muted-foreground">{counts.total}</span>
          </Link>

          {primaryButtons.map((button) => {
            const Icon = button.meta.icon;
            const isEmpty = button.count === 0 && !button.active;

            if (isEmpty) {
              return (
                <span
                  key={button.key}
                  aria-disabled="true"
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-muted px-3 py-2 text-sm text-muted-foreground/60"
                >
                  <Icon className="h-4 w-4" />
                  {button.label}
                  <span className="tabular-nums">{button.count}</span>
                </span>
              );
            }

            const targetHref = button.active
              ? buildLandingHref("/catalog", { targetCategory: "all" })
              : buildLandingHref(categoryLandingPaths[button.key], { targetCategory: button.category });

            return (
              <Link
                key={button.key}
                href={targetHref}
                className={pillClassName(button.active, `${button.meta.activeBg} ${button.meta.activeRing} border-transparent ring-1 ${button.meta.activeColor}`)}
              >
                <Icon className={`h-4 w-4 ${button.active ? button.meta.activeColor : button.meta.color}`} />
                {button.label}
                <span className={`tabular-nums ${button.active ? `${button.meta.activeColor} opacity-70` : "text-muted-foreground"}`}>
                  {button.count}
                </span>
              </Link>
            );
          })}

          {canManage ? (
            <Link
              href={view === "mine"
                ? buildLandingHref(currentLandingPath, { view: "all" })
                : buildLandingHref(currentLandingPath, { view: "mine" })}
              className={pillClassName(view === "mine", "border-transparent bg-foreground text-background")}
            >
              Мои
              <span className="tabular-nums text-muted-foreground">{counts.customCount}</span>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
