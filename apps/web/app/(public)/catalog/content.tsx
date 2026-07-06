import React from "react";
import Link from "next/link";
import { Boxes, Pencil } from "lucide-react";

import { DeleteCustomCatalogIngredientButton } from "@/components/ingredients/delete-custom-catalog-ingredient-button";
import { IngredientFavoriteToggle } from "@/components/ingredients/ingredient-favorite-toggle";
import { IngredientCatalogToolbar } from "@/components/ingredients/ingredient-catalog-toolbar";
import {
  IngredientColorSwatch,
  resolveIngredientColorAccent,
  type IngredientColorAccent
} from "@/components/ingredients/ingredient-color-swatch";
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
  formatConsumableFormLabel,
  formatHopFormLabel,
  formatIngredientSubtypeLabel,
  resolveHopFormBadgeLabel,
  resolveIngredientCountry,
  resolveIngredientUnitLabel,
  resolveYeastFlocculationLabelRu,
  resolveYeastFormLabelRu
} from "@/features/ingredients/presentation";
import {
  resolveIngredientTechnicalDataColorRangeEbc,
  sanitizeIngredientColorValue
} from "@/features/ingredients/technical-fields";
import { listUserCatalogIngredients } from "@/features/ingredients/catalog-service";
import { buildIngredientCatalogActionHref } from "@/features/ingredients/catalog-links";
import {
  buildCatalogItemListJsonLd,
  jsonLdScriptProps,
  type CatalogLandingDefinition
} from "@/features/ingredients/seo";
import { getSessionUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";

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

const buildDetailHref = (item: UserCatalogIngredientDto) => (
  item.source === "custom"
    ? `/catalog/custom/${item.id}`
    : `/catalog/system/${item.id}`
);

const AddToInventoryAction = ({ item }: { item: UserCatalogIngredientDto }) => (
  <Link
    href={buildIngredientCatalogActionHref("/app/ingredients", item.source, item.id)}
    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    aria-label="На склад"
  >
    <Boxes className="h-4 w-4" />
  </Link>
);

const formatValue = (value: number) => value % 1 === 0 ? String(value) : value.toFixed(1).replace(/\.0$/, "");

const formatColorBadge = (item: UserCatalogIngredientDto) => {
  const technicalData = item.technicalData;
  if (technicalData && (technicalData.type === "malt" || technicalData.type === "fermentable")) {
    const range = resolveIngredientTechnicalDataColorRangeEbc(technicalData);
    if (range && technicalData.type === "malt" && (technicalData.colorEbcMin != null || technicalData.colorEbcMax != null)) {
      return range.min === range.max
        ? `${formatValue(range.min)} EBC`
        : `${formatValue(range.min)}-${formatValue(range.max)} EBC`;
    }

    if (range) {
      return `${formatValue(range.average)} EBC`;
    }
  }

  const colorLovibond = sanitizeIngredientColorValue(item.fermentableColorLovibond);
  if (colorLovibond != null) {
    return `${formatValue(colorLovibond * 1.97)} EBC`;
  }

  return null;
};

type KeyStatBadge = {
  key: string;
  label: string;
  accent?: IngredientColorAccent | null;
};

const buildKeyStats = (item: UserCatalogIngredientDto): KeyStatBadge[] => {
  const technicalData = item.technicalData;

  if (item.category === "hop") {
    const hopFormLabel = formatHopFormLabel(item.hopForm);
    return [
      item.hopAlphaAcidPct != null ? { key: "alpha", label: `Альфа ${formatValue(item.hopAlphaAcidPct)}%` } : null,
      item.hopBetaAcidPct != null ? { key: "beta", label: `Бета ${formatValue(item.hopBetaAcidPct)}%` } : null,
      hopFormLabel ? { key: "form", label: hopFormLabel } : null,
      item.properties && typeof item.properties.harvestYear === "number" ? { key: "harvest", label: `Урожай ${item.properties.harvestYear}` } : null
    ].filter((value): value is KeyStatBadge => Boolean(value)).slice(0, 4);
  }

  if (item.category === "fermentable") {
    const colorLabel = formatColorBadge(item);
    return [
      colorLabel ? { key: "color", label: colorLabel, accent: resolveIngredientColorAccent(technicalData) } : null,
      item.fermentableExtractYieldPct != null ? { key: "extract", label: `Экстракт ${formatValue(item.fermentableExtractYieldPct)}%` } : null,
      technicalData && technicalData.type === "malt" && technicalData.proteinPct != null
        ? { key: "protein", label: `Белок ${formatValue((technicalData as Extract<IngredientTechnicalData, { type: "malt" }>).proteinPct ?? 0)}%` }
        : null
    ].filter((value): value is KeyStatBadge => Boolean(value)).slice(0, 4);
  }

  if (item.category === "yeast") {
    const flocculationLabel = resolveYeastFlocculationLabelRu(
      technicalData && technicalData.type === "yeast"
        ? (technicalData as Extract<IngredientTechnicalData, { type: "yeast" }>).flocculation ?? null
        : null
    );
    return [
      item.yeastAttenuationPct != null ? { key: "attenuation", label: `Аттенюация ${formatValue(item.yeastAttenuationPct)}%` } : null,
      item.yeastMinFermentationTempC != null && item.yeastMaxFermentationTempC != null
        ? { key: "temp", label: `${formatValue(item.yeastMinFermentationTempC)}-${formatValue(item.yeastMaxFermentationTempC)}°C` }
        : null,
      flocculationLabel ? { key: "flocculation", label: `Флокуляция ${flocculationLabel}` } : null
    ].filter((value): value is KeyStatBadge => Boolean(value)).slice(0, 4);
  }

  if (item.category === "water_treatment" || item.category === "consumable") {
    // Раньше подтип (техдобавка/санитайзер/…) был виден в отдельной колонке «Тип» —
    // у этих двух категорий он не дублирует название, поэтому переносим его в «Параметры».
    const subtypeLabel = formatIngredientSubtypeLabel(item.category, item.subtype);
    const unitLabel = resolveIngredientUnitLabel(item.unitPreferred ?? item.defaultDisplayUnit);
    const formLabel = technicalData && (technicalData.type === "water_treatment" || technicalData.type === "consumable")
      ? formatConsumableFormLabel((technicalData as Extract<IngredientTechnicalData, { type: "water_treatment" | "consumable" }>).commonForms?.[0])
      : null;
    return [
      subtypeLabel ? { key: "subtype", label: subtypeLabel } : null,
      unitLabel ? { key: "unit", label: unitLabel } : null,
      formLabel ? { key: "form", label: formLabel } : null,
      item.notes ? { key: "notes", label: item.notes } : null
    ].filter((value): value is KeyStatBadge => Boolean(value)).slice(0, 4);
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

// Бейдж подтипа у названия — только когда он несёт информацию: у солода/сырья
// разделяет два подтипа, у хмеля отличает нестандартную форму, у дрожжей — форму.
// Для остальных категорий подтип уже виден в «Параметрах», отдельный бейдж не нужен.
const resolveSubtypeBadgeLabel = (item: UserCatalogIngredientDto): string | null => {
  if (item.category === "fermentable") {
    if (item.subtype === "malt") {
      return "Солод";
    }
    if (item.subtype === "fermentable") {
      return "Сбраживаемое";
    }
    return null;
  }

  if (item.category === "hop") {
    return resolveHopFormBadgeLabel(item.hopForm);
  }

  if (item.category === "yeast") {
    return resolveYeastFormLabelRu(item.yeastForm);
  }

  return null;
};

const buildUsageBadges = (item: UserCatalogIngredientDto): string[] => (
  [
    item.inventoryUsageCount > 0 ? "На складе" : null,
    item.recipeUsageCount > 0 ? `В рецептах ${item.recipeUsageCount}` : null
  ].filter((value): value is string => Boolean(value))
);

const IngredientNameBadges = ({ item, canManage, hideSubtypeBadge = false }: { item: UserCatalogIngredientDto; canManage: boolean; hideSubtypeBadge?: boolean }) => {
  // На лендинге с зашитым подтипом (/catalog/malts) бейдж «Солод» в каждой
  // строке — шум; в смешанных видах он информативен.
  const subtypeBadgeLabel = hideSubtypeBadge ? null : resolveSubtypeBadgeLabel(item);
  const usageBadges = canManage ? buildUsageBadges(item) : [];

  return (
    <>
      {item.source === "custom" ? (
        <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-warning-subtle-foreground ring-1 ring-warning/30">
          {item.derivedFromIngredientId ? "ИЗМЕНЕННЫЙ" : "СВОЙ"}
        </span>
      ) : null}
      {subtypeBadgeLabel ? (
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {subtypeBadgeLabel}
        </span>
      ) : null}
      {usageBadges.map((label) => (
        <span key={label} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-ring/70">
          {label}
        </span>
      ))}
    </>
  );
};

// Вторичное имя (латиница) и мета (бренд · страна) — одной строкой: две
// отдельные строки давали ~88px на строку таблицы против целевых ~60-70px.
const IngredientSecondaryMetaLine = ({ item, leadingLabel }: { item: UserCatalogIngredientDto; leadingLabel?: string | null }) => {
  const meta = buildSecondaryMeta(item);
  if (meta.length === 0 && !leadingLabel) {
    return null;
  }

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      {leadingLabel ? <span>{leadingLabel}</span> : null}
      {meta.map((entry, index) => (
        <React.Fragment key={entry.key}>
          {index > 0 || leadingLabel ? <span aria-hidden="true" className="text-muted-foreground">·</span> : null}
          {entry.kind === "country" ? (
            <CountryFlagLabel countryCode={entry.countryCode} label={entry.label} iconClassName="h-3 w-4" className="gap-1" />
          ) : (
            <span>{entry.label}</span>
          )}
        </React.Fragment>
      ))}
    </p>
  );
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
  const requestedCategory = parseCategory(typeof resolvedSearchParams.category === "string" ? resolvedSearchParams.category : undefined);
  const requestedSubtype = parseSubtype(typeof resolvedSearchParams.subtype === "string" ? resolvedSearchParams.subtype : undefined);
  // На категорийном лендинге category/subtype зашиты в URL пути — query-параметры игнорируются.
  const category = landing ? landing.category : requestedCategory;
  const subtype = landing ? landing.subtype : requestedSubtype;
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

  const currentCategory = category ?? "all";
  const basePath = landing ? `/catalog/${landing.slug}` : "/catalog";

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
    const pageSearchParams = new URLSearchParams();
    if (params.view !== "all") {
      pageSearchParams.set("view", params.view);
    }
    if (params.q.trim()) {
      pageSearchParams.set("q", params.q.trim());
    }
    if (!landing) {
      if (params.category !== "all") {
        pageSearchParams.set("category", params.category);
      }
      if (params.subtype) {
        pageSearchParams.set("subtype", params.subtype);
      }
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
    category: currentCategory,
    subtype: subtype ?? null,
    sort,
    page: 1
  });

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
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {landing ? landing.h1 : "Каталог ингредиентов"}
          </h1>
          {landing ? (
            landing.intro.map((paragraph) => (
              <p key={paragraph} className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {paragraph}
              </p>
            ))
          ) : (
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {canManage
                ? "Системный каталог и ваши пользовательские ингредиенты доступны в одном разделе."
                : "Открытый справочник ингредиентов для домашних пивоваров: солод, хмель, дрожжи и не только."}
            </p>
          )}
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
          {q || canManage ? (
            <div className="mt-5 flex flex-wrap justify-center gap-3">
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
          <section className="catalog-search-dim hidden overflow-hidden rounded-[28px] border border-border bg-card shadow-sm lg:block">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-muted text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="w-[58%] px-5 py-3 font-medium">Ингредиент</th>
                  <th className="px-5 py-3 font-medium">Параметры</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => {
                  const keyStats = buildKeyStats(item);

                  return (
                    <tr key={`${item.source}:${item.id}`} className="border-t border-border align-top">
                      <td className="px-5 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Link href={buildDetailHref(item)} className="font-medium text-foreground underline-offset-4 hover:underline">
                                {item.primaryLabelRu}
                              </Link>
                              <IngredientNameBadges item={item} canManage={canManage} hideSubtypeBadge={Boolean(landing?.subtype)} />
                            </div>
                            <IngredientSecondaryMetaLine item={item} leadingLabel={item.secondaryLabelRu} />
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
                              <AddToInventoryAction item={item} />
                              <Link
                                href={`/catalog/custom/${item.id}/edit`}
                                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
                          ) : canManage ? (
                            <div className="flex items-center gap-1">
                              <IngredientFavoriteToggle
                                reference={{
                                  source: item.source,
                                  id: item.id
                                }}
                                initialFavorite={item.isFavorite ?? false}
                                label={item.isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                              />
                              <AddToInventoryAction item={item} />
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {keyStats.map((badge) => (
                            <span key={badge.key} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-ring/70">
                              {badge.accent ? <IngredientColorSwatch accent={badge.accent} className="h-2.5 w-2.5" /> : null}
                              {badge.label}
                            </span>
                          ))}
                          {keyStats.length === 0 ? <span className="text-xs text-muted-foreground">Без ключевых параметров</span> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="catalog-search-dim grid gap-3 lg:hidden">
            {result.items.map((item) => {
              const keyStats = buildKeyStats(item);

              return (
                <article
                  key={`${item.source}:${item.id}`}
                  className="relative rounded-[24px] border border-border bg-card p-4 shadow-sm"
                >
                  <Link
                    href={buildDetailHref(item)}
                    className="absolute inset-0 z-0 rounded-[24px]"
                    aria-label={item.primaryLabelRu}
                  />

                  <div className="relative z-10 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h2 className="text-base font-semibold text-foreground">{item.primaryLabelRu}</h2>
                        <IngredientNameBadges item={item} canManage={canManage} hideSubtypeBadge={Boolean(landing?.subtype)} />
                      </div>
                      <IngredientSecondaryMetaLine item={item} leadingLabel={item.secondaryLabelRu} />
                    </div>
                    {item.source === "custom" ? (
                      <div className="relative z-10 flex items-center gap-1">
                        <IngredientFavoriteToggle
                          reference={{
                            source: item.source,
                            id: item.id
                          }}
                          initialFavorite={item.isFavorite ?? false}
                          label={item.isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                        />
                        <AddToInventoryAction item={item} />
                        <Link
                          href={`/catalog/custom/${item.id}/edit`}
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
                    ) : canManage ? (
                      <div className="relative z-10 flex items-center gap-1">
                        <IngredientFavoriteToggle
                          reference={{
                            source: item.source,
                            id: item.id
                          }}
                          initialFavorite={item.isFavorite ?? false}
                          label={item.isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                        />
                        <AddToInventoryAction item={item} />
                      </div>
                    ) : null}
                  </div>

                  {keyStats.length > 0 ? (
                    <div className="relative z-10 mt-3 flex flex-wrap gap-1.5">
                      {keyStats.map((badge) => (
                        <span key={badge.key} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-ring/70">
                          {badge.accent ? <IngredientColorSwatch accent={badge.accent} className="h-2.5 w-2.5" /> : null}
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>

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
                      category: currentCategory,
                      subtype: subtype ?? null,
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
