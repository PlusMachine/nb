import Link from "next/link";
import { ArrowRightLeft, Plus, ShieldAlert } from "lucide-react";

import { DeleteCatalogIngredientButton } from "@/components/ingredients/delete-catalog-ingredient-button";
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
  ingredientCategoryLabels
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
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  draft: "border-amber-200 bg-amber-50 text-amber-700",
  archived: "border-zinc-200 bg-zinc-100 text-zinc-700",
  merged: "border-sky-200 bg-sky-50 text-sky-700"
};

const completenessBadgeClasses: Record<IngredientCatalogItemDto["completenessLevel"], string> = {
  minimum: "border-rose-200 bg-rose-50 text-rose-700",
  recommended: "border-amber-200 bg-amber-50 text-amber-700",
  full: "border-emerald-200 bg-emerald-50 text-emerald-700"
};

const visibilityBadgeLabels: Record<IngredientCatalogItemDto["visibility"], string> = {
  public: "Публичный",
  internal: "Internal"
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
      ? "border-zinc-900 bg-zinc-900 text-white"
      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
  }`
);

const buildAliasesPreview = (aliases: string[]) => {
  if (aliases.length === 0) {
    return null;
  }

  const preview = aliases.slice(0, 4).join(", ");
  const rest = aliases.length - 4;
  return rest > 0 ? `${preview} +${rest}` : preview;
};

function CatalogIngredientsTable({ items, showBrandColumn }: CatalogTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-zinc-500">
            <th className="w-[30%] border-b border-zinc-200 px-3 py-3 font-medium">Ингредиент</th>
            {showBrandColumn ? <th className="w-[16%] border-b border-zinc-200 px-3 py-3 font-medium">Бренд</th> : null}
            <th className="w-[16%] border-b border-zinc-200 px-3 py-3 font-medium">Категория</th>
            <th className="w-[17%] border-b border-zinc-200 px-3 py-3 font-medium">Статус</th>
            <th className="w-[10%] border-b border-zinc-200 px-3 py-3 font-medium">Обновлено</th>
            <th className="w-[27%] border-b border-zinc-200 px-3 py-3 font-medium">Действия</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const aliasesPreview = buildAliasesPreview(item.aliases);
            const secondaryName = item.displayNameEn && item.displayNameEn !== item.displayNameRu
              ? item.displayNameEn
              : null;
            const familyName = item.family?.displayNameRu ?? item.family?.canonicalName ?? null;
            const brandLabel = resolveCatalogBrandLabel(item);

            return (
              <tr key={item.id} className="align-top hover:bg-zinc-50/80">
                <td className="border-b border-zinc-100 px-3 py-3">
                  <div className="space-y-1 break-words">
                    <Link
                      className="font-medium text-zinc-950 underline-offset-4 hover:underline"
                      href={`/admin/ingredients/${item.id}`}
                    >
                      {item.displayNameRu}
                    </Link>
                    {secondaryName ? <p className="text-xs text-zinc-500">{secondaryName}</p> : null}
                    {aliasesPreview ? <p className="text-xs text-zinc-500">Алиасы: {aliasesPreview}</p> : null}
                  </div>
                </td>
                {showBrandColumn ? (
                  <td className="border-b border-zinc-100 px-3 py-3">
                    <div className="space-y-1 break-words">
                      <p className="font-medium text-zinc-800">{brandLabel}</p>
                      {item.brandName && item.manufacturer && item.brandName !== item.manufacturer ? (
                        <p className="text-xs text-zinc-500">{item.manufacturer}</p>
                      ) : null}
                      {item.country ? <p className="text-xs text-zinc-500">{item.country}</p> : null}
                    </div>
                  </td>
                ) : null}
                <td className="border-b border-zinc-100 px-3 py-3">
                  <div className="space-y-1 break-words">
                    <p className="font-medium text-zinc-800">{ingredientCategoryLabels[item.category]}</p>
                    <p className="text-xs text-zinc-500">{item.type}</p>
                    {familyName ? <p className="text-xs text-zinc-500">{familyName}</p> : null}
                  </div>
                </td>
                <td className="border-b border-zinc-100 px-3 py-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClasses[item.status]}`}>
                        {statusBadgeLabels[item.status]}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${completenessBadgeClasses[item.completenessLevel]}`}>
                        {ingredientCompletenessLabels[item.completenessLevel]}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">{visibilityBadgeLabels[item.visibility]}</p>
                  </div>
                </td>
                <td className="border-b border-zinc-100 px-3 py-3">
                  <div className="text-xs text-zinc-600">
                    {dateFormatter.format(item.updatedAt)}
                  </div>
                </td>
                <td className="border-b border-zinc-100 px-3 py-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <Link
                      href={`/admin/ingredients/${item.id}`}
                      className="inline-flex items-center rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-white"
                    >
                      Редактировать
                    </Link>
                    <Link
                      href={`/admin/ingredients/merge?sourceId=${item.id}`}
                      className="inline-flex items-center rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-white"
                    >
                      Merge
                    </Link>
                    <DeleteCatalogIngredientButton ingredientId={item.id} displayName={item.displayNameRu} />
                    {item.mergedIntoId ? (
                      <Link
                        href={`/admin/ingredients/${item.mergedIntoId}`}
                        className="inline-flex items-center rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-700"
                      >
                        Target
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
      <header className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
              Каталог ингредиентов
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Администрирование ингредиентов</h1>
              <p className="max-w-4xl text-sm leading-6 text-zinc-600">
                Каталог показан плотным списком. По умолчанию строки отсортированы и сгруппированы по бренду, чтобы
                можно было быстрее проходить большие массивы ингредиентов, чистить дубли и архивировать лишние позиции.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/ingredients/new"
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" />
              Новый ингредиент
            </Link>
            <Link
              href="/admin/ingredients/merge"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700"
            >
              <ArrowRightLeft className="h-4 w-4" />
              Merge дублей
            </Link>
            <Link
              href="/admin/ingredients/moderation"
              className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700"
            >
              <ShieldAlert className="h-4 w-4" />
              Очередь модерации
              <span className="rounded-full bg-white px-2 py-0.5 text-xs text-amber-700">{result.pendingProposals}</span>
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Результаты</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950">{result.total}</p>
            <p className="mt-1 text-xs text-zinc-500">{hasItems ? `${rangeStart}-${rangeEnd} на странице` : "Нет совпадений"}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Черновики</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950">{result.facets.byStatus.draft}</p>
            <p className="mt-1 text-xs text-zinc-500">По текущему фильтру</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Объединённые</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950">{result.facets.byStatus.merged}</p>
            <p className="mt-1 text-xs text-zinc-500">Уже сведённые позиции</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">На модерации</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950">{result.pendingProposals}</p>
            <p className="mt-1 text-xs text-zinc-500">Ожидают решения модератора</p>
          </div>
        </div>
      </header>

      <div className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <form className="grid gap-3 lg:grid-cols-[minmax(0,2.2fr)_1fr_1fr_1fr_auto]">
          <input
            name="q"
            defaultValue={q}
            placeholder="Название, бренд, производитель, алиас"
            className="h-11 rounded-xl border border-zinc-200 px-4 text-sm text-zinc-900"
          />
          <select
            name="category"
            defaultValue={category ?? "all"}
            className="h-11 rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900"
          >
            <option value="all">Все категории</option>
            {ingredientCatalogCategoryOrder.map((itemCategory) => (
              <option key={itemCategory} value={itemCategory}>{ingredientCategoryLabels[itemCategory]}</option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={status ?? "all"}
            className="h-11 rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900"
          >
            <option value="all">Все статусы</option>
            {ingredientCatalogStatuses.map((itemStatus) => (
              <option key={itemStatus} value={itemStatus}>{ingredientCatalogStatusLabels[itemStatus]}</option>
            ))}
          </select>
          <select
            name="sort"
            defaultValue={sort}
            className="h-11 rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900"
          >
            {Object.entries(adminCatalogSortLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button className="h-11 rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white" type="submit">
              Применить
            </button>
            <Link
              href="/admin/ingredients"
              className="inline-flex h-11 items-center rounded-xl border border-zinc-200 px-4 text-sm text-zinc-600"
            >
              Сбросить
            </Link>
          </div>
        </form>

        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Категории</p>
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
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">{categoryTotal}</span>
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
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">{result.facets.byCategory[itemCategory]}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Статусы</p>
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
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">{statusTotal}</span>
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
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">{result.facets.byStatus[itemStatus]}</span>
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
                <section key={group.key} className="rounded-3xl border border-zinc-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
                    <div>
                      <h2 className="text-lg font-semibold text-zinc-950">{group.label}</h2>
                      <p className="text-sm text-zinc-500">{group.items.length} позиций на текущей странице</p>
                    </div>
                  </div>
                  <CatalogIngredientsTable items={group.items} showBrandColumn={false} />
                </section>
              ))}
            </div>
          )
          : (
            <section className="rounded-3xl border border-zinc-200 bg-white shadow-sm">
              <CatalogIngredientsTable items={result.items} showBrandColumn={true} />
            </section>
          )
      ) : (
        <section className="rounded-3xl border border-dashed border-zinc-300 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Ничего не найдено</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Попробуйте изменить фильтры, включить другой порядок сортировки или создать новый ингредиент.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              href="/admin/ingredients"
              className="inline-flex items-center rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-700"
            >
              Сбросить фильтры
            </Link>
            <Link
              href="/admin/ingredients/new"
              className="inline-flex items-center rounded-xl bg-zinc-950 px-4 py-2 text-sm text-white"
            >
              Создать ингредиент
            </Link>
          </div>
        </section>
      )}

      <footer className="flex flex-col gap-3 rounded-3xl border border-zinc-200 bg-white p-5 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-zinc-500">
          {result.total > 0 ? `Показаны позиции ${rangeStart}-${rangeEnd} из ${result.total}` : "Нет результатов для текущего фильтра"}
        </p>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              className="inline-flex items-center rounded-xl border border-zinc-200 px-4 py-2 text-zinc-700"
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
              className="inline-flex items-center rounded-xl border border-zinc-200 px-4 py-2 text-zinc-700"
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
