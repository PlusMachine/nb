import React from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";

import { DeleteCustomCatalogIngredientButton } from "@/components/ingredients/delete-custom-catalog-ingredient-button";
import { IngredientFavoriteToggle } from "@/components/ingredients/ingredient-favorite-toggle";
import { IngredientCatalogToolbar } from "@/components/ingredients/ingredient-catalog-toolbar";
import { CountryFlagLabel } from "@/components/shared/country-flag";
import {
  type IngredientTechnicalData,
  ingredientCatalogSortOptions,
  ingredientCatalogViews,
  ingredientCategories,
  type IngredientCatalogSortOption,
  type IngredientCatalogView,
  type IngredientCategory,
  type IngredientSubtype,
  type UserCatalogIngredientDto
} from "@/features/ingredients/contracts";
import {
  formatIngredientSubtypeLabel,
  ingredientCategoryLabels,
  resolveIngredientCountry
} from "@/features/ingredients/presentation";
import { listUserCatalogIngredients } from "@/features/ingredients/catalog-service";
import { requireUser } from "@/lib/auth";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const parseView = (value: string | undefined): IngredientCatalogView => (
  ingredientCatalogViews.includes(value as IngredientCatalogView)
    ? value as IngredientCatalogView
    : "all"
);

const parseCategory = (value: string | undefined): IngredientCategory | undefined => (
  ingredientCategories.includes(value as IngredientCategory)
    ? value as IngredientCategory
    : undefined
);

const parseSort = (value: string | undefined): IngredientCatalogSortOption => (
  ingredientCatalogSortOptions.includes(value as IngredientCatalogSortOption)
    ? value as IngredientCatalogSortOption
    : "name"
);

const parseSubtype = (value: string | undefined): Extract<IngredientSubtype, "malt" | "fermentable"> | undefined => (
  value === "malt" || value === "fermentable" ? value : undefined
);

const parsePage = (value: string | undefined) => {
  const parsed = Number(value ?? "1");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
};

const buildCatalogPageHref = (
  params: {
    view: IngredientCatalogView;
    q: string;
    category: IngredientCategory | "all";
    subtype: "malt" | "fermentable" | null;
    sort: IngredientCatalogSortOption;
    page: number;
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
  if (params.page > 1) {
    searchParams.set("page", String(params.page));
  }

  const query = searchParams.toString();
  return query ? `/app/catalog?${query}` : "/app/catalog";
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
  return query ? `/app/catalog/new?${query}` : "/app/catalog/new";
};

const buildDetailHref = (item: UserCatalogIngredientDto) => (
  item.source === "custom"
    ? `/app/catalog/custom/${item.id}`
    : `/app/catalog/system/${item.id}`
);

const formatValue = (value: number) => value % 1 === 0 ? String(value) : value.toFixed(1).replace(/\.0$/, "");

const formatColorBadge = (item: UserCatalogIngredientDto) => {
  if (item.fermentableColorLovibond != null) {
    return `${formatValue(item.fermentableColorLovibond * 1.97)} EBC`;
  }

  const technicalData = item.technicalData;
  if (technicalData && (technicalData.type === "malt" || technicalData.type === "fermentable")) {
    if (technicalData.type === "malt" && technicalData.colorEbcMin != null && technicalData.colorEbcMax != null) {
      const malt = technicalData as Extract<IngredientTechnicalData, { type: "malt" }>;
      const colorEbcMin = malt.colorEbcMin!;
      const colorEbcMax = malt.colorEbcMax!;
      return colorEbcMin === colorEbcMax
        ? `${formatValue(colorEbcMin)} EBC`
        : `${formatValue(colorEbcMin)}-${formatValue(colorEbcMax)} EBC`;
    }

    if (technicalData.type === "malt" && technicalData.colorEbcMin != null) {
      const malt = technicalData as Extract<IngredientTechnicalData, { type: "malt" }>;
      const colorEbcMin = malt.colorEbcMin!;
      return `${formatValue(colorEbcMin)} EBC`;
    }

    if (technicalData.type === "fermentable" && technicalData.colorLovibond != null) {
      const fermentable = technicalData as Extract<IngredientTechnicalData, { type: "fermentable" }>;
      return `${formatValue((fermentable.colorLovibond ?? 0) * 1.97)} EBC`;
    }
  }

  return null;
};

const buildKeyStats = (item: UserCatalogIngredientDto) => {
  const technicalData = item.technicalData;

  if (item.category === "hop") {
    return [
      item.hopAlphaAcidPct != null ? `Альфа ${formatValue(item.hopAlphaAcidPct)}%` : null,
      item.hopBetaAcidPct != null ? `Бета ${formatValue(item.hopBetaAcidPct)}%` : null,
      item.hopForm ? item.hopForm.replaceAll("_", " ") : null,
      item.properties && typeof item.properties.harvestYear === "number" ? `Урожай ${item.properties.harvestYear}` : null
    ].filter((value): value is string => Boolean(value)).slice(0, 4);
  }

  if (item.category === "fermentable") {
    return [
      formatColorBadge(item),
      item.fermentableExtractYieldPct != null ? `Экстракт ${formatValue(item.fermentableExtractYieldPct)}%` : null,
      technicalData && technicalData.type === "malt" && technicalData.proteinPct != null
        ? `Белок ${formatValue((technicalData as Extract<IngredientTechnicalData, { type: "malt" }>).proteinPct ?? 0)}%`
        : null
    ].filter((value): value is string => Boolean(value)).slice(0, 4);
  }

  if (item.category === "yeast") {
    return [
      item.yeastAttenuationPct != null ? `Атт. ${formatValue(item.yeastAttenuationPct)}%` : null,
      item.yeastMinFermentationTempC != null && item.yeastMaxFermentationTempC != null
        ? `${formatValue(item.yeastMinFermentationTempC)}-${formatValue(item.yeastMaxFermentationTempC)}°C`
        : null,
      technicalData && technicalData.type === "yeast" && technicalData.flocculation
        ? (technicalData as Extract<IngredientTechnicalData, { type: "yeast" }>).flocculation ?? null
        : null
    ].filter((value): value is string => Boolean(value)).slice(0, 4);
  }

  if (item.category === "water_treatment" || item.category === "consumable") {
    return [
      item.unitPreferred ?? item.defaultDisplayUnit ?? null,
      technicalData && (technicalData.type === "water_treatment" || technicalData.type === "consumable")
        ? ((technicalData as Extract<IngredientTechnicalData, { type: "water_treatment" | "consumable" }>).commonForms?.[0]?.replaceAll("_", " ")) ?? null
        : null,
      item.notes ?? null
    ].filter((value): value is string => Boolean(value)).slice(0, 3);
  }

  return [];
};

type SecondaryMetaItem =
  | { key: string; kind: "text"; label: string }
  | { key: string; kind: "country"; countryCode: string | null; label: string };

const buildSecondaryMeta = (item: UserCatalogIngredientDto): SecondaryMetaItem[] => {
  const meta: SecondaryMetaItem[] = [];
  const seen = new Set<string>();

  const pushText = (label?: string | null) => {
    const trimmed = label?.trim();
    if (!trimmed) {
      return;
    }

    const key = `text:${trimmed.toLowerCase()}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    meta.push({
      key,
      kind: "text",
      label: trimmed
    });
  };

  const pushCountry = () => {
    const country = resolveIngredientCountry(item);
    if (!country) {
      return;
    }

    const key = `country:${country.code ?? country.label.toLowerCase()}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    meta.push({
      key,
      kind: "country",
      countryCode: country.code,
      label: country.label
    });
  };

  pushText(item.brand ?? item.producer ?? null);
  pushCountry();
  pushText(item.derivedFromDisplayName ? `На основе ${item.derivedFromDisplayName}` : null);

  return meta.slice(0, 3);
};

const resolveListTypeLabel = (item: UserCatalogIngredientDto) => (
  item.category === "fermentable"
    ? (item.subtype === "malt" ? "Солод" : "Сбраживаемое сырье")
    : formatIngredientSubtypeLabel(item.category, item.subtype)
);

export default async function IngredientCatalogPage({ searchParams }: Props) {
  const user = await requireUser();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const view = parseView(typeof resolvedSearchParams.view === "string" ? resolvedSearchParams.view : undefined);
  const q = String(resolvedSearchParams.q ?? "").trim();
  const category = parseCategory(typeof resolvedSearchParams.category === "string" ? resolvedSearchParams.category : undefined);
  const subtype = parseSubtype(typeof resolvedSearchParams.subtype === "string" ? resolvedSearchParams.subtype : undefined);
  const sort = parseSort(typeof resolvedSearchParams.sort === "string" ? resolvedSearchParams.sort : undefined);
  const page = parsePage(typeof resolvedSearchParams.page === "string" ? resolvedSearchParams.page : undefined);

  const result = await listUserCatalogIngredients(user.id, {
    view,
    q: q || undefined,
    category,
    subtype,
    sort,
    page,
    pageSize: 20
  });

  const currentCategory = category ?? "all";

  return (
    <main className="space-y-6">
      <section className="space-y-2">
        <div className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
          Каталог ингредиентов
        </div>
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Каталог ингредиентов</h1>
          <p className="max-w-3xl text-sm leading-6 text-zinc-600">
            Системный каталог и ваши пользовательские ингредиенты доступны в одном рабочем разделе.
          </p>
        </div>
      </section>

      <IngredientCatalogToolbar
        view={view}
        q={q}
        category={currentCategory}
        subtype={subtype ?? null}
        sort={sort}
        counts={{
          total: result.facets.catalogCount + result.facets.customCount,
          customCount: result.facets.customCount,
          catalogCount: result.facets.catalogCount,
          byCategory: result.facets.byCategory,
          byFermentableSubtype: result.facets.byFermentableSubtype
        }}
      />

      {result.items.length === 0 ? (
        <section className="rounded-[28px] border border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-center">
          <h2 className="text-lg font-semibold text-zinc-900">
            {view === "mine" ? "У вас пока нет пользовательских ингредиентов" : "По текущим условиям ничего не найдено"}
          </h2>
          <p className="mt-2 text-sm text-zinc-500">
            {view === "mine"
              ? "Создайте свой ингредиент с нуля или сделайте свой вариант на основе системного."
              : "Попробуйте изменить запрос, фильтр категории или сортировку."}
          </p>
          <div className="mt-5 flex justify-center">
            <Link href={buildCreateCustomIngredientHref({ category: currentCategory, subtype: subtype ?? null })} className="rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white">
              Создать свой ингредиент
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="hidden overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm lg:block">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-zinc-50 text-left text-[11px] uppercase tracking-[0.12em] text-zinc-500">
                <tr>
                  <th className="px-5 py-4 font-medium">Ингредиент</th>
                  <th className="px-5 py-4 font-medium">Тип</th>
                  <th className="px-5 py-4 font-medium">Параметры</th>
                  <th className="px-5 py-4 font-medium">Использование</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => (
                  <tr key={`${item.source}:${item.id}`} className="border-t border-zinc-100 align-top">
                    <td className="px-5 py-4">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link href={buildDetailHref(item)} className="font-medium text-zinc-950 underline-offset-4 hover:underline">
                                {item.primaryLabelRu}
                              </Link>
                              {item.source === "custom" ? (
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-200">
                                  {item.derivedFromIngredientId ? "ИЗМЕНЕННЫЙ" : "СВОЙ"}
                                </span>
                              ) : null}
                            </div>
                            {item.secondaryLabelRu ? <p className="text-xs text-zinc-500">{item.secondaryLabelRu}</p> : null}
                          </div>
                          {item.source === "custom" ? (
                            <div className="flex items-center gap-1">
                              <IngredientFavoriteToggle
                                reference={{
                                  source: item.source,
                                  id: item.id
                                }}
                                initialFavorite={item.isFavorite ?? false}
                                label={item.isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                              />
                              <Link
                                href={`/app/catalog/custom/${item.id}/edit`}
                                className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                                aria-label="Редактировать"
                              >
                                <Pencil className="h-4 w-4" />
                              </Link>
                              <DeleteCustomCatalogIngredientButton
                                ingredientId={item.id}
                                displayName={item.primaryLabelRu}
                                label="Удалить"
                                variant="icon"
                              />
                            </div>
                          ) : (
                            <IngredientFavoriteToggle
                              reference={{
                                source: item.source,
                                id: item.id
                              }}
                              initialFavorite={item.isFavorite ?? false}
                              label={item.isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                            />
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {buildSecondaryMeta(item).map((badge) => (
                            <span key={badge.key} className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-600">
                              {badge.kind === "country" ? (
                                <CountryFlagLabel
                                  countryCode={badge.countryCode}
                                  label={badge.label}
                                  iconClassName="h-3 w-4"
                                  className="gap-1"
                                />
                              ) : (
                                badge.label
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="space-y-1">
                        <p className="font-medium text-zinc-800">{resolveListTypeLabel(item)}</p>
                        <p className="text-xs text-zinc-500">{ingredientCategoryLabels[item.category]}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {buildKeyStats(item).map((badge) => (
                          <span key={badge} className="rounded-md bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600 ring-1 ring-zinc-200/70">
                            {badge}
                          </span>
                        ))}
                        {buildKeyStats(item).length === 0 ? <span className="text-xs text-zinc-400">Без ключевых параметров</span> : null}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="space-y-1 text-xs text-zinc-600">
                        <p>Склад: {item.inventoryUsageCount}</p>
                        <p>Рецепты: {item.recipeUsageCount}</p>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="grid gap-3 lg:hidden">
            {result.items.map((item) => (
              <article
                key={`${item.source}:${item.id}`}
                className="rounded-[24px] border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={buildDetailHref(item)} className="block">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-semibold text-zinc-950">{item.primaryLabelRu}</h2>
                          {item.source === "custom" ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-200">
                              {item.derivedFromIngredientId ? "ИЗМЕНЕННЫЙ" : "СВОЙ"}
                            </span>
                          ) : null}
                        </div>
                        {item.secondaryLabelRu ? <p className="text-xs text-zinc-500">{item.secondaryLabelRu}</p> : null}
                      </div>
                    </Link>
                  </div>
                  {item.source === "custom" ? (
                    <div className="flex items-center gap-1">
                      <IngredientFavoriteToggle
                        reference={{
                          source: item.source,
                          id: item.id
                        }}
                        initialFavorite={item.isFavorite ?? false}
                        label={item.isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                      />
                      <Link
                        href={`/app/catalog/custom/${item.id}/edit`}
                        className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                        aria-label="Редактировать"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <DeleteCustomCatalogIngredientButton
                        ingredientId={item.id}
                        displayName={item.primaryLabelRu}
                        label="Удалить"
                        variant="icon"
                      />
                    </div>
                  ) : (
                    <IngredientFavoriteToggle
                      reference={{
                        source: item.source,
                        id: item.id
                      }}
                      initialFavorite={item.isFavorite ?? false}
                      label={item.isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                    />
                  )}
                </div>

                <Link href={buildDetailHref(item)} className="mt-3 block">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-zinc-800">{resolveListTypeLabel(item)}</p>
                      <p className="text-xs text-zinc-500">{ingredientCategoryLabels[item.category]}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {buildSecondaryMeta(item).map((badge) => (
                      <span key={badge.key} className="rounded-md bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600 ring-1 ring-zinc-200/70">
                        {badge.kind === "country" ? (
                          <CountryFlagLabel
                            countryCode={badge.countryCode}
                            label={badge.label}
                            iconClassName="h-3 w-4"
                            className="gap-1"
                          />
                        ) : (
                          badge.label
                        )}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {buildKeyStats(item).map((badge) => (
                      <span key={badge} className="rounded-md bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600 ring-1 ring-zinc-200/70">
                        {badge}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 flex gap-4 text-xs text-zinc-500">
                    <span>Склад: {item.inventoryUsageCount}</span>
                    <span>Рецепты: {item.recipeUsageCount}</span>
                  </div>
                </Link>
              </article>
            ))}
          </section>

          {result.totalPages > 1 ? (
            <nav className="flex items-center justify-between rounded-[24px] border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm">
              <Link
                href={buildCatalogPageHref({
                  view,
                  q,
                  category: currentCategory,
                  subtype: subtype ?? null,
                  sort,
                  page: Math.max(1, result.page - 1)
                })}
                className={`rounded-lg px-3 py-2 ${result.page <= 1 ? "pointer-events-none text-zinc-300" : "text-zinc-700 hover:bg-zinc-50"}`}
              >
                Назад
              </Link>
              <span className="text-zinc-500">Страница {result.page} из {result.totalPages}</span>
              <Link
                href={buildCatalogPageHref({
                  view,
                  q,
                  category: currentCategory,
                  subtype: subtype ?? null,
                  sort,
                  page: Math.min(result.totalPages, result.page + 1)
                })}
                className={`rounded-lg px-3 py-2 ${result.page >= result.totalPages ? "pointer-events-none text-zinc-300" : "text-zinc-700 hover:bg-zinc-50"}`}
              >
                Дальше
              </Link>
            </nav>
          ) : null}
        </>
      )}
    </main>
  );
}
