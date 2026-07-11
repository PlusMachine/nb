import Link from "next/link";
import { ArrowRightLeft, Plus, ShieldAlert } from "lucide-react";

import { Button } from "@nb/ui";
import { DeleteCatalogIngredientButton } from "@/components/ingredients/delete-catalog-ingredient-button";
import { CountryFlagLabel } from "@/components/shared/country-flag";
import {
  adminCatalogSortLabels,
  buildAdminIngredientsHref,
  groupCatalogIngredientsByBrand,
  ingredientCatalogCategoryOrder,
  ingredientCatalogStatusLabels,
  ingredientCatalogStatuses,
  ingredientCompletenessLabels,
  parseAdminCatalogSort,
  parseIngredientCatalogStatus,
  resolveCatalogBrandLabel,
  type IngredientCatalogStatus
} from "@/features/ingredients/admin-page-model";
import {
  ingredientCategories,
  type IngredientCatalogItemDto,
  type IngredientCategory
} from "@/features/ingredients/contracts";
import {
  ingredientCategoryLabels,
  resolveIngredientCountry,
  resolveIngredientDisplayNames,
  resolveIngredientFamilyDisplayName
} from "@/features/ingredients/presentation";
import { listCatalogIngredients } from "@/features/ingredients/service";
import { requireRole } from "@/lib/auth";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type CatalogTableProps = {
  items: IngredientCatalogItemDto[];
  showBrandColumn: boolean;
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  year: "numeric"
});

const pageSize = 100;

const statusBadgeLabels: Record<IngredientCatalogStatus, string> = {
  active: "Активен",
  draft: "Черновик",
  archived: "Архив",
  merged: "Объединён"
};

const statusBadgeClasses: Record<IngredientCatalogStatus, string> = {
  active: "border-success/30 bg-success-subtle text-success-subtle-foreground",
  draft: "border-warning/30 bg-warning-subtle text-warning-subtle-foreground",
  archived: "border-border bg-muted text-muted-foreground",
  merged: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300"
};

const completenessBadgeClasses: Record<IngredientCatalogItemDto["completenessLevel"], string> = {
  minimum: "border-destructive-border bg-destructive-subtle text-destructive-subtle-foreground",
  recommended: "border-warning/30 bg-warning-subtle text-warning-subtle-foreground",
  full: "border-success/30 bg-success-subtle text-success-subtle-foreground"
};

const visibilityBadgeLabels: Record<IngredientCatalogItemDto["visibility"], string> = {
  public: "Публичный",
  internal: "Внутренний"
};

const parsePage = (value: string | undefined) => {
  const parsed = Number(value ?? "1");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
};

const parseCategory = (value: string | undefined): IngredientCategory | undefined => (
  ingredientCategories.includes(value as IngredientCategory)
    ? value as IngredientCategory
    : undefined
);

const pillClassName = (isActive: boolean) => (
  `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
    isActive
      ? "border-foreground bg-foreground text-background"
      : "border-border bg-card text-foreground hover:border-border/70 hover:bg-muted"
  }`
);

const buildAliasesPreview = (aliases: IngredientCatalogItemDto["aliases"]) => {
  if (aliases.length === 0) {
    return null;
  }

  const preview = aliases.slice(0, 4).map((alias) => alias.alias).join(", ");
  const rest = aliases.length - 4;
  return rest > 0 ? `${preview} +${rest}` : preview;
};

function CatalogIngredientsTable({ items, showBrandColumn }: CatalogTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            <th className="w-[30%] border-b border-border px-3 py-3 font-medium">Ингредиент</th>
            {showBrandColumn ? <th className="w-[16%] border-b border-border px-3 py-3 font-medium">Бренд</th> : null}
            <th className="w-[16%] border-b border-border px-3 py-3 font-medium">Категория</th>
            <th className="w-[17%] border-b border-border px-3 py-3 font-medium">Статус</th>
            <th className="w-[10%] border-b border-border px-3 py-3 font-medium">Обновлено</th>
            <th className="w-[27%] border-b border-border px-3 py-3 font-medium">Действия</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const aliasesPreview = buildAliasesPreview(item.aliases);
            const { primaryName, secondaryName } = resolveIngredientDisplayNames(item);
            const familyName = resolveIngredientFamilyDisplayName({
              displayName: primaryName
            }) ?? null;
            const brandLabel = resolveCatalogBrandLabel(item);
            const country = resolveIngredientCountry(item);

            return (
              <tr key={item.id} className="align-top hover:bg-accent/80">
                <td className="border-b border-border px-3 py-3">
                  <div className="space-y-1 break-words">
                    <Link
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                      href={`/admin/ingredients/${item.id}`}
                    >
                      {primaryName}
                    </Link>
                    {secondaryName ? <p className="text-xs text-muted-foreground">{secondaryName}</p> : null}
                    {aliasesPreview ? <p className="text-xs text-muted-foreground">Алиасы: {aliasesPreview}</p> : null}
                  </div>
                </td>
                {showBrandColumn ? (
                  <td className="border-b border-border px-3 py-3">
                    <div className="space-y-1 break-words">
                      <p className="font-medium text-foreground">{brandLabel}</p>
                      {item.brandName && item.manufacturer && item.brandName !== item.manufacturer ? (
                        <p className="text-xs text-muted-foreground">{item.manufacturer}</p>
                      ) : null}
                      {country ? (
                        <div className="text-xs text-muted-foreground">
                          <CountryFlagLabel
                            countryCode={country.code}
                            label={country.label}
                            iconClassName="h-3 w-4"
                            className="gap-1"
                          />
                        </div>
                      ) : null}
                    </div>
                  </td>
                ) : null}
                <td className="border-b border-border px-3 py-3">
                  <div className="space-y-1 break-words">
                    <p className="font-medium text-foreground">{ingredientCategoryLabels[item.category]}</p>
                    <p className="text-xs text-muted-foreground">{item.type}</p>
                    {familyName ? <p className="text-xs text-muted-foreground">{familyName}</p> : null}
                  </div>
                </td>
                <td className="border-b border-border px-3 py-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClasses[item.status]}`}>
                        {statusBadgeLabels[item.status]}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${completenessBadgeClasses[item.completenessLevel]}`}>
                        {ingredientCompletenessLabels[item.completenessLevel]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{visibilityBadgeLabels[item.visibility]}</p>
                  </div>
                </td>
                <td className="border-b border-border px-3 py-3">
                  <div className="text-xs text-muted-foreground">
                    {dateFormatter.format(item.updatedAt)}
                  </div>
                </td>
                <td className="border-b border-border px-3 py-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <Link
                      href={`/admin/ingredients/${item.id}`}
                      className="inline-flex items-center rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-card"
                    >
                      Редактировать
                    </Link>
                    <Link
                      href={`/admin/ingredients/merge?sourceId=${item.id}`}
                      className="inline-flex items-center rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-card"
                    >
                      Объединить
                    </Link>
                    <DeleteCatalogIngredientButton ingredientId={item.id} displayName={primaryName} />
                    {item.mergedIntoId ? (
                      <Link
                        href={`/admin/ingredients/${item.mergedIntoId}`}
                        className="inline-flex items-center rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300"
                      >
                        Итоговый
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminIngredientsPage({ searchParams }: Props) {
  await requireRole("admin");

  const params = await searchParams;
  const page = parsePage(typeof params.page === "string" ? params.page : undefined);
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const category = parseCategory(typeof params.category === "string" ? params.category : undefined);
  const status = parseIngredientCatalogStatus(typeof params.status === "string" ? params.status : undefined);
  const sort = parseAdminCatalogSort(typeof params.sort === "string" ? params.sort : undefined);

  const result = await listCatalogIngredients({
    page,
    pageSize,
    q: q || undefined,
    category,
    status,
    sort
  });

  const groups = sort === "brand" ? groupCatalogIngredientsByBrand(result.items) : [];
  const hasItems = result.items.length > 0;
  const categoryTotal = Object.values(result.facets.byCategory).reduce((sum, count) => sum + count, 0);
  const statusTotal = Object.values(result.facets.byStatus).reduce((sum, count) => sum + count, 0);
  const rangeStart = hasItems ? ((page - 1) * result.pageSize) + 1 : 0;
  const rangeEnd = hasItems ? rangeStart + result.items.length - 1 : 0;

  return (
    <section className="space-y-5">
      <header className="space-y-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Каталог ингредиентов
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Администрирование ингредиентов</h1>
              <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
                Каталог показан плотным списком. По умолчанию строки отсортированы и сгруппированы по бренду, чтобы
                можно было быстрее проходить большие массивы ингредиентов, чистить дубли и архивировать лишние позиции.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/ingredients/new"
              className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background"
            >
              <Plus className="h-4 w-4" />
              Новый ингредиент
            </Link>
            <Link
              href="/admin/ingredients/merge"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground"
            >
              <ArrowRightLeft className="h-4 w-4" />
              Объединение дублей
            </Link>
            <Link
              href="/admin/ingredients/moderation"
              className="inline-flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-subtle px-4 py-2.5 text-sm font-medium text-warning-subtle-foreground"
            >
              <ShieldAlert className="h-4 w-4" />
              Очередь модерации
              <span className="rounded-full bg-card px-2 py-0.5 text-xs text-warning-subtle-foreground">{result.pendingProposals}</span>
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-border bg-muted p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Результаты</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{result.total}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hasItems ? `${rangeStart}-${rangeEnd} на странице` : "Нет совпадений"}</p>
          </div>
          <div className="rounded-2xl border border-border bg-muted p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Черновики</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{result.facets.byStatus.draft}</p>
            <p className="mt-1 text-xs text-muted-foreground">По текущему фильтру</p>
          </div>
          <div className="rounded-2xl border border-border bg-muted p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Объединённые</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{result.facets.byStatus.merged}</p>
            <p className="mt-1 text-xs text-muted-foreground">Уже сведённые позиции</p>
          </div>
          <div className="rounded-2xl border border-border bg-muted p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">На модерации</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{result.pendingProposals}</p>
            <p className="mt-1 text-xs text-muted-foreground">Ожидают решения модератора</p>
          </div>
        </div>
      </header>

      <div className="space-y-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
        <form className="grid gap-3 lg:grid-cols-[minmax(0,2.2fr)_1fr_1fr_1fr_auto]">
          <input
            name="q"
            defaultValue={q}
            placeholder="Название, бренд, производитель, алиас"
            className="h-11 rounded-xl border border-border px-4 text-sm text-foreground"
          />
          <select
            name="category"
            defaultValue={category ?? "all"}
            className="h-11 rounded-xl border border-border px-3 text-sm text-foreground"
          >
            <option value="all">Все категории</option>
            {ingredientCatalogCategoryOrder.map((itemCategory) => (
              <option key={itemCategory} value={itemCategory}>{ingredientCategoryLabels[itemCategory]}</option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={status ?? "all"}
            className="h-11 rounded-xl border border-border px-3 text-sm text-foreground"
          >
            <option value="all">Все статусы</option>
            {ingredientCatalogStatuses.map((itemStatus) => (
              <option key={itemStatus} value={itemStatus}>{ingredientCatalogStatusLabels[itemStatus]}</option>
            ))}
          </select>
          <select
            name="sort"
            defaultValue={sort}
            className="h-11 rounded-xl border border-border px-3 text-sm text-foreground"
          >
            {Object.entries(adminCatalogSortLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button type="submit" size="md">
              Применить
            </Button>
            <Link
              href="/admin/ingredients"
              className="inline-flex h-11 items-center rounded-xl border border-border px-4 text-sm text-muted-foreground"
            >
              Сбросить
            </Link>
          </div>
        </form>

        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Категории</p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildAdminIngredientsHref("/admin/ingredients", {
                  q,
                  status: status ?? "all",
                  sort
                })}
                className={pillClassName(category == null)}
              >
                Все
                <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs">{categoryTotal}</span>
              </Link>
              {ingredientCatalogCategoryOrder.map((itemCategory) => (
                <Link
                  key={itemCategory}
                  href={buildAdminIngredientsHref("/admin/ingredients", {
                    q,
                    category: itemCategory,
                    status: status ?? "all",
                    sort
                  })}
                  className={pillClassName(category === itemCategory)}
                >
                  {ingredientCategoryLabels[itemCategory]}
                  <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs">{result.facets.byCategory[itemCategory]}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Статусы</p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildAdminIngredientsHref("/admin/ingredients", {
                  q,
                  category: category ?? "all",
                  sort
                })}
                className={pillClassName(status == null)}
              >
                Все
                <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs">{statusTotal}</span>
              </Link>
              {ingredientCatalogStatuses.map((itemStatus) => (
                <Link
                  key={itemStatus}
                  href={buildAdminIngredientsHref("/admin/ingredients", {
                    q,
                    category: category ?? "all",
                    status: itemStatus,
                    sort
                  })}
                  className={pillClassName(status === itemStatus)}
                >
                  {ingredientCatalogStatusLabels[itemStatus]}
                  <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs">{result.facets.byStatus[itemStatus]}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {hasItems ? (
        sort === "brand"
          ? (
            <div className="space-y-4">
              {groups.map((group) => (
                <section key={group.key} className="rounded-3xl border border-border bg-card shadow-sm">
                  <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">{group.label}</h2>
                      <p className="text-sm text-muted-foreground">{group.items.length} позиций на текущей странице</p>
                    </div>
                  </div>
                  <CatalogIngredientsTable items={group.items} showBrandColumn={false} />
                </section>
              ))}
            </div>
          )
          : (
            <section className="rounded-3xl border border-border bg-card shadow-sm">
              <CatalogIngredientsTable items={result.items} showBrandColumn={true} />
            </section>
          )
      ) : (
        <section className="rounded-3xl border border-dashed border-border bg-card p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Ничего не найдено</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Попробуйте изменить фильтры, включить другой порядок сортировки или создать новый ингредиент.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              href="/admin/ingredients"
              className="inline-flex items-center rounded-xl border border-border px-4 py-2 text-sm text-foreground"
            >
              Сбросить фильтры
            </Link>
            <Link
              href="/admin/ingredients/new"
              className="inline-flex items-center rounded-xl bg-foreground px-4 py-2 text-sm text-background"
            >
              Создать ингредиент
            </Link>
          </div>
        </section>
      )}

      <footer className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          {result.total > 0 ? `Показаны позиции ${rangeStart}-${rangeEnd} из ${result.total}` : "Нет результатов для текущего фильтра"}
        </p>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              className="inline-flex items-center rounded-xl border border-border px-4 py-2 text-foreground"
              href={buildAdminIngredientsHref("/admin/ingredients", {
                q,
                category: category ?? "all",
                status: status ?? "all",
                sort,
                page: page - 1
              })}
            >
              Назад
            </Link>
          ) : null}
          {page * result.pageSize < result.total ? (
            <Link
              className="inline-flex items-center rounded-xl border border-border px-4 py-2 text-foreground"
              href={buildAdminIngredientsHref("/admin/ingredients", {
                q,
                category: category ?? "all",
                status: status ?? "all",
                sort,
                page: page + 1
              })}
            >
              Дальше
            </Link>
          ) : null}
        </div>
      </footer>
    </section>
  );
}
