import Link from "next/link";
import { notFound } from "next/navigation";

import { CatalogItemsList } from "@/components/ingredients/catalog-items-list";
import { categoryMeta } from "@/components/ingredients/catalog-category-meta";
import { IngredientCatalogToolbar } from "@/components/ingredients/ingredient-catalog-toolbar";
import {
  ingredientCatalogSortOptions,
  ingredientCatalogViews,
  ingredientCategories,
  type CatalogLandingSlug,
  type IngredientCatalogSortOption,
  type IngredientCatalogView,
  type IngredientCategory,
  type IngredientSubtype,
  type UserCatalogListResult
} from "@/features/ingredients/contracts";
import { listCatalogHubSections, listUserCatalogIngredients } from "@/features/ingredients/catalog-service";
import { ingredientCategoryLabels } from "@/features/ingredients/presentation";
import {
  buildCatalogItemListJsonLd,
  jsonLdScriptProps,
  type CatalogLandingDefinition
} from "@/features/ingredients/seo";
import { getSessionUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { pluralize } from "@/lib/pluralize";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  landing?: CatalogLandingDefinition | null;
};

const CATALOG_PAGE_SIZE = 50;

export const parseView = (value: string | undefined): IngredientCatalogView => (
  ingredientCatalogViews.includes(value as IngredientCatalogView)
    ? value as IngredientCatalogView
    : "all"
);

export const parseCategory = (value: string | undefined): IngredientCategory | undefined => (
  ingredientCategories.includes(value as IngredientCategory)
    ? value as IngredientCategory
    : undefined
);

export const parseSort = (value: string | undefined): IngredientCatalogSortOption => (
  ingredientCatalogSortOptions.includes(value as IngredientCatalogSortOption)
    ? value as IngredientCatalogSortOption
    : "name"
);

export const parseSubtype = (value: string | undefined): Extract<IngredientSubtype, "malt" | "fermentable"> | undefined => (
  value === "malt" || value === "fermentable" ? value : undefined
);

export const parsePage = (value: string | undefined) => {
  const parsed = Number(value ?? "1");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
};

type PaginationToken =
  | { kind: "page"; page: number }
  | { kind: "ellipsis"; key: string };

const buildPaginationTokens = (currentPage: number, totalPages: number): PaginationToken[] => {
  const tokens: PaginationToken[] = [{ kind: "page", page: 1 }];
  const windowStart = Math.max(2, currentPage - 2);
  const windowEnd = Math.min(totalPages - 1, currentPage + 2);

  if (windowStart > 2) {
    tokens.push({ kind: "ellipsis", key: "start" });
  }

  for (let page = windowStart; page <= windowEnd; page += 1) {
    if (page > 1 && page < totalPages) {
      tokens.push({ kind: "page", page });
    }
  }

  if (windowEnd < totalPages - 1) {
    tokens.push({ kind: "ellipsis", key: "end" });
  }

  if (totalPages > 1) {
    tokens.push({ kind: "page", page: totalPages });
  }

  return tokens;
};

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

// Хелпер для ссылок, зависящих только от view/q (хаб-секции, фолбэк «в других
// разделах» на лендинге, сброс поиска на хабе) — без category/subtype/sort,
// которых у этих ссылок нет. См. notes/catalog-hub-redesign.md, S2/S4.
const buildViewQueryHref = (basePath: string, params: { view: IngredientCatalogView; q: string }) => {
  const searchParams = new URLSearchParams();

  if (params.view !== "all") {
    searchParams.set("view", params.view);
  }

  if (params.q.trim()) {
    searchParams.set("q", params.q.trim());
  }

  const query = searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
};

const matchWordForms: [string, string, string] = ["совпадение", "совпадения", "совпадений"];

// Заголовки секций хаба = лейблы пилюль тулбара (ingredient-catalog-toolbar.tsx).
const catalogHubSectionLabels: Record<CatalogLandingSlug, string> = {
  malts: "Солод",
  fermentables: "Сбраживаемое сырье",
  hops: ingredientCategoryLabels.hop,
  yeast: ingredientCategoryLabels.yeast,
  water: ingredientCategoryLabels.water_treatment,
  consumables: ingredientCategoryLabels.consumable
};

// Хаб каталога (/catalog без лендинга): секции по категориям вместо плоского
// списка. См. notes/catalog-hub-redesign.md, S2.
const renderCatalogHub = async ({
  userId,
  canManage,
  view,
  q
}: {
  userId: string | null;
  canManage: boolean;
  view: IngredientCatalogView;
  q: string;
}) => {
  const result = await listCatalogHubSections(userId, { view, q: q || undefined });
  const hasQuery = Boolean(q);
  const visibleSections = result.sections.filter((section) => section.total > 0);

  const resetSearchHref = buildViewQueryHref("/catalog", { view, q: "" });

  const shouldRenderItemListJsonLd = !hasQuery && view !== "mine";
  const jsonLdPreviewItems = shouldRenderItemListJsonLd
    ? result.sections.flatMap((section) => section.items).slice(0, 10)
    : [];
  const itemListJsonLd = jsonLdPreviewItems.length > 0
    ? buildCatalogItemListJsonLd(jsonLdPreviewItems, {
      baseUrl: getServerEnv().APP_URL,
      path: "/catalog",
      offset: 0
    })
    : null;

  return (
    <main className="space-y-6">
      <section className="space-y-2">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Каталог ингредиентов</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {canManage
              ? "Системный каталог и ваши пользовательские ингредиенты доступны в одном разделе."
              : "Открытый справочник ингредиентов для домашних пивоваров: солод, хмель, дрожжи и не только."}
          </p>
        </div>
      </section>

      <IngredientCatalogToolbar
        view={view}
        q={q}
        category="all"
        subtype={null}
        sort="name"
        canManage={canManage}
        queryBasePath="/catalog"
        showSort={false}
        counts={{
          total: result.facets.catalogCount + result.facets.customCount,
          customCount: result.facets.customCount,
          catalogCount: result.facets.catalogCount,
          byCategory: result.facets.byCategory,
          byFermentableSubtype: result.facets.byFermentableSubtype
        }}
      />

      {visibleSections.length === 0 ? (
        <section className="rounded-[28px] border border-dashed border-border bg-muted px-6 py-10 text-center">
          <h2 className="text-lg font-semibold text-foreground">
            {view === "mine" ? "У вас пока нет пользовательских ингредиентов" : "По текущим условиям ничего не найдено"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {view === "mine"
              ? "Создайте свой ингредиент с нуля или сделайте свой вариант на основе системного."
              : "Попробуйте изменить запрос, фильтр категории или сортировку."}
          </p>
          {q || canManage ? (
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {q ? (
                <Link href={resetSearchHref} className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-card">
                  Сбросить поиск
                </Link>
              ) : null}
              {canManage ? (
                <Link href={buildCreateCustomIngredientHref({ category: "all", subtype: null })} className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-background">
                  Создать свой ингредиент
                </Link>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : (
        visibleSections.map((section) => {
          const label = catalogHubSectionLabels[section.slug];
          const meta = categoryMeta[section.category];
          const Icon = meta.icon;
          const sectionHref = buildViewQueryHref(`/catalog/${section.slug}`, { view, q: "" });
          const sectionSearchHref = buildViewQueryHref(`/catalog/${section.slug}`, { view, q });
          const showAllInSectionLink = hasQuery && section.total > section.items.length;

          return (
            <section key={section.slug} className="space-y-3 rounded-[28px] border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${meta.color}`} />
                  <h2 className="text-lg font-semibold text-foreground">{label}</h2>
                  {hasQuery ? (
                    <span className="tabular-nums text-sm text-muted-foreground">{section.total}</span>
                  ) : null}
                </div>
                {!hasQuery ? (
                  <Link href={sectionHref} className="text-sm font-medium text-link hover:text-link/80">
                    Все {section.total}
                  </Link>
                ) : null}
              </div>

              <CatalogItemsList
                items={section.items}
                hideSubtypeBadge={Boolean(section.subtype)}
                canManage={canManage}
              />

              {showAllInSectionLink ? (
                <p>
                  <Link href={sectionSearchHref} className="text-sm font-medium text-link hover:text-link/80">
                    Все {section.total} в разделе
                  </Link>
                </p>
              ) : null}
            </section>
          );
        })
      )}
      {/* JSON-LD в конце main: первым ребёнком <script> участвует в space-y-6
          и даёт 24px layout shift, когда исчезает при q/view=mine. */}
      {itemListJsonLd ? <script {...jsonLdScriptProps(itemListJsonLd)} /> : null}
    </main>
  );
};

// otherCount по формулам S4 (notes/catalog-hub-redesign.md): сколько совпадений
// нашлось бы за пределами текущего категорийного лендинга при том же q/view.
const resolveOtherCategoriesCount = (landing: CatalogLandingDefinition, facets: UserCatalogListResult["facets"]) => {
  const totalAcrossCategories = Object.values(facets.byCategory).reduce((sum, count) => sum + count, 0);

  if (landing.slug === "malts") {
    return totalAcrossCategories - facets.byFermentableSubtype.malt;
  }

  if (landing.slug === "fermentables") {
    return totalAcrossCategories - facets.byFermentableSubtype.fermentable;
  }

  return totalAcrossCategories - facets.byCategory[landing.category];
};

export async function IngredientCatalogContent({ searchParams, landing = null }: Props = {}) {
  const user = await getSessionUser();
  const userId = user?.id ?? null;
  const canManage = Boolean(userId);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedView = parseView(typeof resolvedSearchParams.view === "string" ? resolvedSearchParams.view : undefined);
  // Вкладка «Пользовательские ингредиенты» доступна только залогиненным.
  const view: IngredientCatalogView = canManage ? requestedView : "all";
  const q = String(resolvedSearchParams.q ?? "").trim();

  if (!landing) {
    return renderCatalogHub({ userId, canManage, view, q });
  }

  const category = landing.category;
  const subtype = landing.subtype;
  const sort = parseSort(typeof resolvedSearchParams.sort === "string" ? resolvedSearchParams.sort : undefined);
  const page = parsePage(typeof resolvedSearchParams.page === "string" ? resolvedSearchParams.page : undefined);

  const result = await listUserCatalogIngredients(userId, {
    view,
    q: q || undefined,
    category,
    subtype,
    sort,
    page,
    pageSize: CATALOG_PAGE_SIZE
  });

  // Страница за пределами пагинации — soft-404 (playbook §4), а не пустое
  // состояние с 200. Поиск (?q=) исключён: 0 совпадений там не «страница за
  // диапазоном», а обычный пустой результат запроса.
  if (!q && page > 1 && page > result.totalPages) {
    notFound();
  }

  const currentCategory = category ?? "all";
  const basePath = `/catalog/${landing.slug}`;

  const buildCatalogPageHref = (
    params: {
      view: IngredientCatalogView;
      q: string;
      sort: IngredientCatalogSortOption;
      page: number;
    }
  ) => {
    const pageSearchParams = new URLSearchParams();
    if (params.view !== "all") {
      pageSearchParams.set("view", params.view);
    }
    if (params.q.trim()) {
      pageSearchParams.set("q", params.q.trim());
    }
    if (params.sort !== "name") {
      pageSearchParams.set("sort", params.sort);
    }
    if (params.page > 1) {
      pageSearchParams.set("page", String(params.page));
    }

    const query = pageSearchParams.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  const resetSearchHref = buildCatalogPageHref({
    view,
    q: "",
    sort,
    page: 1
  });

  // Фолбэк «в других разделах» (S4): только на лендинге при непустом q.
  const otherCount = q ? resolveOtherCategoriesCount(landing, result.facets) : 0;
  const otherCategoriesHref = buildViewQueryHref("/catalog", { view, q });
  const showOtherCategoriesLine = Boolean(q) && otherCount > 0 && result.items.length > 0;
  const showOtherCategoriesButton = Boolean(q) && otherCount > 0 && result.items.length === 0;

  const shouldRenderItemListJsonLd = !q && view !== "mine" && result.items.length > 0;
  const itemListJsonLd = shouldRenderItemListJsonLd
    ? buildCatalogItemListJsonLd(result.items.slice(0, 10), {
      baseUrl: getServerEnv().APP_URL,
      path: basePath,
      offset: (result.page - 1) * CATALOG_PAGE_SIZE
    })
    : null;

  return (
    <main className="space-y-6">
      <section className="space-y-2">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{landing.h1}</h1>
          {landing.intro.map((paragraph) => (
            <p key={paragraph} className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      <IngredientCatalogToolbar
        view={view}
        q={q}
        category={currentCategory}
        subtype={subtype ?? null}
        sort={sort}
        canManage={canManage}
        queryBasePath="/catalog"
        counts={{
          total: result.facets.catalogCount + result.facets.customCount,
          customCount: result.facets.customCount,
          catalogCount: result.facets.catalogCount,
          byCategory: result.facets.byCategory,
          byFermentableSubtype: result.facets.byFermentableSubtype
        }}
      />

      {showOtherCategoriesLine ? (
        <p className="text-sm text-muted-foreground">
          Ещё {otherCount} {pluralize(otherCount, matchWordForms)} в других разделах —{" "}
          <Link href={otherCategoriesHref} className="font-medium text-link hover:text-link/80">
            показать все
          </Link>
        </p>
      ) : null}

      {result.items.length === 0 ? (
        <section className="rounded-[28px] border border-dashed border-border bg-muted px-6 py-10 text-center">
          <h2 className="text-lg font-semibold text-foreground">
            {view === "mine" ? "У вас пока нет пользовательских ингредиентов" : "По текущим условиям ничего не найдено"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {view === "mine"
              ? "Создайте свой ингредиент с нуля или сделайте свой вариант на основе системного."
              : "Попробуйте изменить запрос, фильтр категории или сортировку."}
          </p>
          {showOtherCategoriesButton || q || canManage ? (
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {showOtherCategoriesButton ? (
                <Link href={otherCategoriesHref} className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-background">
                  Показать {otherCount} {pluralize(otherCount, matchWordForms)} в каталоге
                </Link>
              ) : null}
              {q ? (
                <Link href={resetSearchHref} className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-card">
                  Сбросить поиск
                </Link>
              ) : null}
              {canManage ? (
                <Link href={buildCreateCustomIngredientHref({ category: currentCategory, subtype: subtype ?? null })} className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-background">
                  Создать свой ингредиент
                </Link>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : (
        <>
          <CatalogItemsList
            items={result.items}
            hideSubtypeBadge={Boolean(landing.subtype)}
            canManage={canManage}
          />

          {result.totalPages > 1 ? (
            <nav aria-label="Страницы каталога" className="flex flex-wrap items-center justify-center gap-1.5 rounded-[24px] border border-border bg-card px-4 py-3 text-sm shadow-sm">
              {buildPaginationTokens(result.page, result.totalPages).map((token) => {
                if (token.kind === "ellipsis") {
                  return (
                    <span key={token.key} className="px-1 text-muted-foreground">
                      …
                    </span>
                  );
                }

                if (token.page === result.page) {
                  return (
                    <span
                      key={token.page}
                      aria-current="page"
                      className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-foreground px-2 font-medium text-background"
                    >
                      {token.page}
                    </span>
                  );
                }

                return (
                  <Link
                    key={token.page}
                    href={buildCatalogPageHref({
                      view,
                      q,
                      sort,
                      page: token.page
                    })}
                    className="flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-foreground hover:bg-muted"
                  >
                    {token.page}
                  </Link>
                );
              })}
            </nav>
          ) : null}
        </>
      )}
      {/* JSON-LD в конце main: первым ребёнком <script> участвует в space-y-6
          и даёт 24px layout shift, когда исчезает при q/view=mine. */}
      {itemListJsonLd ? <script {...jsonLdScriptProps(itemListJsonLd)} /> : null}
    </main>
  );
}
