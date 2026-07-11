import React, { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FeedbackReportLink } from "@/components/feedback/feedback-report-link";
import { DeleteCustomCatalogIngredientButton } from "@/components/ingredients/delete-custom-catalog-ingredient-button";
import { IngredientFavoriteToggle } from "@/components/ingredients/ingredient-favorite-toggle";
import { IngredientPurchaseLinksEditor } from "@/components/ingredients/ingredient-purchase-links-manager";
import { RecipesGrid } from "@/components/recipes/recipes-grid";
import { CountryFlag, CountryFlagLabel } from "@/components/shared/country-flag";
import {
  IngredientColorSwatch,
  resolveIngredientColorAccent
} from "@/components/ingredients/ingredient-color-swatch";
import {
  getUserCatalogIngredientByRef,
  listAnalogCatalogIngredients,
  listSameBrandCatalogIngredients
} from "@/features/ingredients/catalog-service";
import { buildIngredientCatalogActionHref } from "@/features/ingredients/catalog-links";
import type { IngredientTechnicalData, UserCatalogIngredientDto } from "@/features/ingredients/contracts";
import {
  resolveConsumableInventoryBroadGroup,
  resolveConsumableInventoryBroadGroupLabel
} from "@/features/ingredients/consumables";
import {
  formatIngredientSubtypeLabel,
  resolveIngredientBrandLabel,
  resolveIngredientCountry,
  resolveIngredientFermentableKindLabel,
  resolveYeastFlocculationLabelRu,
  resolveYeastFormLabelRu,
  type ResolvedIngredientCountry
} from "@/features/ingredients/presentation";
import {
  buildIngredientDetailJsonLd,
  buildIngredientDetailMetadata,
  jsonLdScriptProps,
  resolveCatalogLandingForFilter
} from "@/features/ingredients/seo";
import {
  formatHopFormLabel,
  resolveIngredientTechnicalDataColorRangeEbc,
  sanitizeIngredientColorValue
} from "@/features/ingredients/technical-fields";
import { listPublicRecipesForIngredient } from "@/features/recipes/service";
import { getSessionUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";

// "system"/"custom" — сегмент URL; getUserCatalogIngredientByRef ждёт "catalog"/"custom".
const resolveCatalogSource = (source: string): "catalog" | "custom" | null => (
  source === "custom" ? "custom" : source === "system" ? "catalog" : null
);

// Дедуп запроса в пределах одного рендера: generateMetadata и сам компонент
// делят один SELECT сессии + ингредиента (см. паттерн в articles/[slug]/page.tsx).
const loadIngredientDetail = cache(async (resolvedSource: "catalog" | "custom", id: string) => {
  const user = await getSessionUser();
  const item = await getUserCatalogIngredientByRef(user?.id ?? null, resolvedSource, id);
  return { user, item };
});

const formatValue = (value: number) => value % 1 === 0 ? String(value) : value.toFixed(1).replace(/\.0$/, "");

const splitDescriptionParagraphs = (value: string) => value
  .split(/\n{2,}/)
  .map((paragraph) => paragraph.trim())
  .filter(Boolean);

const resolveFermentableColor = (item: UserCatalogIngredientDto) => {
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

type TechnicalRow =
  | { label: string; kind: "text"; value: string }
  | { label: string; kind: "formula"; value: string }
  | { label: string; kind: "country"; country: ResolvedIngredientCountry };

// Химическая формула с нижними индексами (CaSO4 → CaSO₄) — как в плашках
// склада (inventory-list-item.tsx), но в компактном серверном варианте.
const renderChemicalFormula = (formula: string) => {
  const symbols = [...formula];
  const parts: React.ReactNode[] = [];
  let index = 0;

  while (index < symbols.length) {
    const previous = index > 0 ? symbols[index - 1] : null;
    if (/\d/.test(symbols[index]) && previous && /[A-Za-zА-Яа-я)\]]/.test(previous)) {
      const start = index;
      while (index < symbols.length && /\d/.test(symbols[index])) {
        index += 1;
      }
      parts.push(
        <sub key={`sub-${start}`} className="text-[0.8em] leading-none">
          {symbols.slice(start, index).join("")}
        </sub>
      );
      continue;
    }

    parts.push(<React.Fragment key={`char-${index}`}>{symbols[index]}</React.Fragment>);
    index += 1;
  }

  return parts;
};

const renderTechnicalRows = (item: UserCatalogIngredientDto) => {
  const rows: TechnicalRow[] = [];
  const color = resolveFermentableColor(item);
  const technicalData = item.technicalData;
  const brandLabel = resolveIngredientBrandLabel(item);

  if (item.hopAlphaAcidPct != null) {
    rows.push({ label: "Альфа-кислота", kind: "text", value: `${formatValue(item.hopAlphaAcidPct)}%` });
  }
  if (item.hopBetaAcidPct != null) {
    rows.push({ label: "Бета-кислота", kind: "text", value: `${formatValue(item.hopBetaAcidPct)}%` });
  }
  const hopTechnicalData = technicalData?.type === "hop"
    ? technicalData as Extract<IngredientTechnicalData, { type: "hop" }>
    : null;
  const hopFormLabel = formatHopFormLabel(item.hopForm ?? hopTechnicalData?.hopForm ?? null);
  if (hopFormLabel) {
    rows.push({ label: "Форма", kind: "text", value: hopFormLabel });
  }
  if (color) {
    rows.push({ label: "Цвет", kind: "text", value: color });
  }
  if (technicalData?.type === "water_treatment") {
    const record = technicalData as Record<string, unknown>;
    // Приоритет у химической формулы: displayFormula в данных иногда хранит
    // концентрацию («88%»), а не формулу.
    const formula = [record.formula, record.displayFormula]
      .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
    if (formula) {
      rows.push({ label: "Формула", kind: "formula", value: formula.trim() });
    }
  }
  if (item.fermentableExtractYieldPct != null) {
    rows.push({ label: "Экстрактивность", kind: "text", value: `${formatValue(item.fermentableExtractYieldPct)}%` });
  }
  if (item.yeastAttenuationPct != null) {
    rows.push({ label: "Аттенюация", kind: "text", value: `${formatValue(item.yeastAttenuationPct)}%` });
  }
  if (item.yeastMinFermentationTempC != null || item.yeastMaxFermentationTempC != null) {
    rows.push({
      label: "Температура",
      kind: "text",
      value: `${item.yeastMinFermentationTempC ?? "?"}-${item.yeastMaxFermentationTempC ?? "?"} °C`
    });
  }
  const yeastTechnicalData = technicalData?.type === "yeast"
    ? technicalData as Extract<IngredientTechnicalData, { type: "yeast" }>
    : null;
  const yeastFormLabel = item.category === "yeast"
    ? resolveYeastFormLabelRu(item.yeastForm ?? yeastTechnicalData?.form ?? null)
    : null;
  if (yeastFormLabel) {
    rows.push({ label: "Форма", kind: "text", value: yeastFormLabel });
  }
  if (brandLabel) {
    rows.push({ label: "Бренд", kind: "text", value: brandLabel });
  }
  const country = resolveIngredientCountry(item);
  if (country) {
    rows.push({ label: "Страна", kind: "country", country });
  }
  if (item.productCode) {
    rows.push({ label: "Код", kind: "text", value: item.productCode });
  }
  if (technicalData && technicalData.type === "malt" && technicalData.proteinPct != null) {
    const malt = technicalData as Extract<IngredientTechnicalData, { type: "malt" }>;
    rows.push({ label: "Белок", kind: "text", value: `${formatValue(malt.proteinPct ?? 0)}%` });
  }
  if (technicalData && technicalData.type === "yeast" && technicalData.alcoholToleranceAbvTypical != null) {
    const yeast = technicalData as Extract<IngredientTechnicalData, { type: "yeast" }>;
    rows.push({ label: "Алк. толерантность", kind: "text", value: `${formatValue(yeast.alcoholToleranceAbvTypical ?? 0)}% ABV` });
  }
  if (technicalData && technicalData.type === "yeast" && technicalData.flocculation) {
    const yeast = technicalData as Extract<IngredientTechnicalData, { type: "yeast" }>;
    const flocculationLabel = resolveYeastFlocculationLabelRu(yeast.flocculation);
    if (flocculationLabel) {
      rows.push({ label: "Флокуляция", kind: "text", value: flocculationLabel });
    }
  }

  return rows;
};

// Один ключевой параметр для строк перелинковки («Похожие ингредиенты»,
// «Другие ингредиенты {бренд}») — по одному числу на категорию, без дублирования
// всей таблицы «Параметры».
const resolveIngredientKeyMetricLabel = (candidate: UserCatalogIngredientDto): string | null => {
  if (candidate.category === "hop" && candidate.hopAlphaAcidPct != null) {
    return `альфа ${formatValue(candidate.hopAlphaAcidPct)}%`;
  }

  if (candidate.category === "fermentable") {
    return resolveFermentableColor(candidate);
  }

  if (candidate.category === "yeast" && candidate.yeastAttenuationPct != null) {
    return `аттенюация ${formatValue(candidate.yeastAttenuationPct)}%`;
  }

  return null;
};

const buildCatalogHref = (candidate: Pick<UserCatalogIngredientDto, "source" | "id">) => (
  `/catalog/${candidate.source === "custom" ? "custom" : "system"}/${candidate.id}`
);

// Заголовок блока «Другие … {бренд}» — по факту состава: когда все позиции
// одной категории с эталоном, называем её прямо («Другие дрожжи Lallemand»),
// при смешанном ассортименте бренда остаётся общее «Другие ингредиенты».
const resolveBrandBlockTitle = (item: UserCatalogIngredientDto, brandItems: UserCatalogIngredientDto[]) => {
  if (!brandItems.every((candidate) => candidate.category === item.category)) {
    return "Другие ингредиенты";
  }

  switch (item.category) {
    case "yeast":
      return "Другие дрожжи";
    case "hop":
      return "Другой хмель";
    case "fermentable":
      return brandItems.every((candidate) => candidate.subtype === "malt") && item.subtype === "malt"
        ? "Другой солод"
        : "Другие ингредиенты";
    default:
      return "Другие ингредиенты";
  }
};

const renderIngredientLinkRows = (items: UserCatalogIngredientDto[], options?: { showBrand?: boolean }) => (
  <div className="space-y-2">
    {items.map((candidate) => {
      const metric = resolveIngredientKeyMetricLabel(candidate);
      const accent = candidate.category === "fermentable"
        ? resolveIngredientColorAccent(candidate.technicalData)
        : null;
      const brand = options?.showBrand ? resolveIngredientBrandLabel(candidate) : null;
      const country = options?.showBrand ? resolveIngredientCountry(candidate) : null;
      return (
        <Link
          key={`${candidate.source}-${candidate.id}`}
          href={buildCatalogHref(candidate)}
          className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3 text-sm transition-colors hover:bg-accent"
        >
          <span className="min-w-0">
            <span className="block truncate font-medium text-foreground">{candidate.primaryLabelRu}</span>
            {brand || country?.code ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {country?.code ? <CountryFlag countryCode={country.code} className="h-3 w-4" /> : null}
                {brand ? <span className="truncate">{brand}</span> : null}
              </span>
            ) : null}
          </span>
          {metric ? (
            <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
              {accent ? <IngredientColorSwatch accent={accent} className="h-2.5 w-2.5" /> : null}
              {metric}
            </span>
          ) : null}
        </Link>
      );
    })}
  </div>
);

export async function generateMetadata({
  params
}: {
  params: Promise<{ source: string; id: string }>;
}): Promise<Metadata> {
  const { source, id } = await params;
  const resolvedSource = resolveCatalogSource(source);
  if (!resolvedSource) {
    // notFound в generateMetadata отрабатывает до начала стриминга — ответ
    // получает настоящий 404-статус, а не мягкий 200+noindex.
    notFound();
  }

  const { item } = await loadIngredientDetail(resolvedSource, id);
  if (!item) {
    notFound();
  }

  return buildIngredientDetailMetadata(item, { source: source as "system" | "custom", id });
}

export default async function IngredientDetailPage({
  params
}: {
  params: Promise<{ source: string; id: string }>;
}) {
  const { source, id } = await params;
  const resolvedSource = resolveCatalogSource(source);

  if (!resolvedSource) {
    notFound();
  }

  const { user, item } = await loadIngredientDetail(resolvedSource, id);
  if (!item) {
    notFound();
  }

  const userId = user?.id ?? null;
  const canManage = Boolean(userId);

  // Блоки перелинковки и рецепты — только для системных ингредиентов
  // (кастомные видны только владельцу и не участвуют в SEO-перелинковке).
  const [analogItems, brandItems, recipesResult] = item.source === "catalog"
    ? await Promise.all([
      listAnalogCatalogIngredients(item, 6),
      listSameBrandCatalogIngredients(item, 5),
      listPublicRecipesForIngredient(item.id, 5)
    ])
    : [[] as UserCatalogIngredientDto[], [] as UserCatalogIngredientDto[], { total: 0, items: [] }];

  const technicalRows = renderTechnicalRows(item);
  const packageVariants = item.packageVariants ?? [];
  const subtypeLabel = formatIngredientSubtypeLabel(item.category, item.subtype);
  const typeLabel = item.category === "fermentable"
    ? (item.subtype === "malt" ? "Солод" : resolveIngredientFermentableKindLabel(item) ?? "Сбраживаемое сырье")
    // Подтип «другое» ничего не сообщает — показываем группу. У consumable это
    // broad group («Специи и добавки» / «Расходники»), а не категория целиком:
    // иначе на карточке специи чип говорил бы «Расходники» вопреки крошке.
    : subtypeLabel === "другое"
      ? (item.category === "consumable"
        ? resolveConsumableInventoryBroadGroupLabel(resolveConsumableInventoryBroadGroup(item)) ?? subtypeLabel
        : formatIngredientSubtypeLabel(item.category, null))
      : subtypeLabel;
  // Алиас, совпадающий с заголовком или латинским именем, — не «другое имя».
  const headerNames = new Set(
    [item.primaryLabelRu, item.secondaryLabelRu]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toLowerCase())
  );
  const subtleAliases = Array.from(new Set(item.aliases.map((alias) => alias.alias).filter(Boolean)))
    .filter((alias) => !headerNames.has(alias.trim().toLowerCase()));
  const brandLabel = resolveIngredientBrandLabel(item);
  const country = resolveIngredientCountry(item);
  const loginHref = `/login?next=${encodeURIComponent(`/catalog/${source}/${id}`)}`;
  const jsonLd = source === "system"
    ? buildIngredientDetailJsonLd(item, { baseUrl: getServerEnv().APP_URL, source: "system", id })
    : null;

  const landingSubtype = item.subtype === "malt" || item.subtype === "fermentable" ? item.subtype : null;
  const landing = resolveCatalogLandingForFilter(
    item.category,
    landingSubtype,
    item.category === "consumable" ? resolveConsumableInventoryBroadGroup(item) : null
  );

  const showUsageSection = canManage && (item.inventoryUsageCount > 0 || item.recipeUsageCount > 0);
  const hasRightColumn = analogItems.length > 0 || recipesResult.items.length > 0 || brandItems.length > 0 || canManage;

  const descriptionParagraphs = item.descriptionRu ? splitDescriptionParagraphs(item.descriptionRu) : [];

  const leftColumn = (
    <div className="space-y-6">
      {descriptionParagraphs.length ? (
        <section className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Описание</h2>
          <div className="mt-4 space-y-3 text-sm leading-6 text-foreground">
            {descriptionParagraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </section>
      ) : null}

      {technicalRows.length ? (
        <section className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Параметры</h2>
          <div className="mt-4 space-y-3">
            {technicalRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3">
                <span className="text-sm text-muted-foreground">{row.label}</span>
                {row.kind === "country" ? (
                  <CountryFlagLabel
                    countryCode={row.country.code}
                    label={row.country.label}
                    iconClassName="h-3.5 w-[1.1rem]"
                    className="gap-1.5 text-sm font-medium text-foreground"
                  />
                ) : row.kind === "formula" ? (
                  <span aria-label={`Формула: ${row.value}`} className="text-sm font-medium text-foreground">
                    {renderChemicalFormula(row.value)}
                  </span>
                ) : (
                  <span className="text-sm font-medium text-foreground">{row.value}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {packageVariants.length ? (
        <section className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Фасовки</h2>
          <div className="mt-4 space-y-2">
            {packageVariants.map((variant) => {
              const name = variant.productNameRu ?? variant.productNameEn ?? variant.brand ?? "Фасовка";
              const amountLabel = variant.packageAmount != null && variant.packageUnit
                ? `${formatValue(variant.packageAmount)} ${variant.packageUnit}`
                : variant.stockContentAmount != null && variant.stockContentUnit
                  ? `${formatValue(variant.stockContentAmount)} ${variant.stockContentUnit}`
                  : null;

              return (
                <div key={variant.id} className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{name}</p>
                    {variant.brand && variant.brand !== name ? (
                      <p className="text-xs text-muted-foreground">{variant.brand}</p>
                    ) : null}
                  </div>
                  {amountLabel ? <span className="shrink-0 text-sm text-muted-foreground">{amountLabel}</span> : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {subtleAliases.length ? (
        <section className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Также известен как:</span>
            {subtleAliases.map((alias) => (
              <span key={alias} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                {alias}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );

  return (
    <main className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/catalog" className="hover:text-foreground">Каталог</Link></li>
          {landing ? (
            <>
              <li aria-hidden="true">/</li>
              <li><Link href={`/catalog/${landing.slug}`} className="hover:text-foreground">{landing.h1}</Link></li>
            </>
          ) : null}
          <li aria-hidden="true">/</li>
          <li><span aria-current="page">{item.primaryLabelRu}</span></li>
        </ol>
      </nav>

      <section className="rounded-[32px] border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="min-w-0 text-3xl font-semibold tracking-tight text-foreground">
                {item.primaryLabelRu}
                {brandLabel ? (
                  <span className="font-medium text-muted-foreground"> · {brandLabel}</span>
                ) : null}
              </h1>
              {canManage ? (
                <IngredientFavoriteToggle
                  reference={{
                    source: item.source,
                    id: item.id
                  }}
                  initialFavorite={item.isFavorite ?? false}
                  size="md"
                  label={item.isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                />
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
              {item.secondaryLabelRu ? (
                <span className="text-muted-foreground">{item.secondaryLabelRu}</span>
              ) : null}
              <span className="rounded-full bg-muted px-3 py-1 text-foreground">{typeLabel}</span>
              {country ? (
                <span className="rounded-full bg-muted px-3 py-1 text-foreground">
                  <CountryFlagLabel
                    countryCode={country.code}
                    label={country.label}
                    iconClassName="h-3.5 w-[1.1rem]"
                    className="gap-1.5"
                  />
                </span>
              ) : null}
              {item.source === "custom" ? (
                <span className="rounded-full bg-warning-subtle px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-warning-subtle-foreground ring-1 ring-warning/30">
                  СВОЙ
                </span>
              ) : null}
              {item.status === "archived" ? (
                <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  В архиве
                </span>
              ) : null}
            </div>

            {item.derivedFromDisplayName ? (
              <p className="text-sm text-muted-foreground">
                Основан на системном ингредиенте <strong>{item.derivedFromDisplayName}</strong>.
              </p>
            ) : null}

            {item.notes ? (
              <div className="rounded-2xl bg-muted p-4 text-sm leading-6 text-foreground">
                {item.notes}
              </div>
            ) : null}

            {item.source === "catalog" ? (
              <FeedbackReportLink
                entityType="ingredient"
                entityId={item.id}
                entityLabel={item.primaryLabelRu}
              >
                Нашли неточность в данных?
              </FeedbackReportLink>
            ) : null}
          </div>

          {canManage ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:w-[360px]">
              <Link href={buildIngredientCatalogActionHref("/app/ingredients", item.source, item.id)} className="inline-flex h-11 items-center justify-center rounded-xl bg-foreground px-4 text-sm font-medium text-background">
                Добавить на склад
              </Link>
              <Link href={buildIngredientCatalogActionHref("/app/recipes/new", item.source, item.id)} className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent">
                Использовать в рецепте
              </Link>
              {item.source === "catalog" ? (
                <Link href={`/catalog/new?derivedFrom=${item.id}`} className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent sm:col-span-2">
                  Создать свой вариант
                </Link>
              ) : (
                <>
                  <Link href={`/catalog/custom/${item.id}/edit`} className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent">
                    Редактировать
                  </Link>
                  <DeleteCustomCatalogIngredientButton
                    ingredientId={item.id}
                    displayName={item.primaryLabelRu}
                    redirectHref="/catalog?view=mine"
                    label="Удалить"
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-destructive-border bg-card px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive-subtle disabled:opacity-60"
                  />
                </>
              )}
            </div>
          ) : (
            <div className="xl:w-[360px]">
              <Link href={loginHref} className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-foreground px-4 text-sm font-medium text-background">
                Добавить на склад
              </Link>
            </div>
          )}
        </div>
      </section>

      {hasRightColumn ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          {leftColumn}

          <div className="space-y-6">
            {brandItems.length ? (
              <section className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
                <h2 className="flex flex-wrap items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {resolveBrandBlockTitle(item, brandItems)} {brandLabel}
                  {country?.code ? <CountryFlag countryCode={country.code} className="h-3 w-4" /> : null}
                </h2>
                <div className="mt-4">{renderIngredientLinkRows(brandItems)}</div>
              </section>
            ) : null}

            {recipesResult.items.length ? (
              <section className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Рецепты с этим ингредиентом · {recipesResult.total}
                </h2>
                <div className="mt-4">
                  <RecipesGrid recipes={recipesResult.items} view="grid" preferredGravityUnit={user?.preferredGravityUnit} />
                </div>
              </section>
            ) : null}

            {analogItems.length ? (
              <section className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Аналоги</h2>
                <div className="mt-4">{renderIngredientLinkRows(analogItems, { showBrand: true })}</div>
              </section>
            ) : null}

            {showUsageSection ? (
              <section className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Использование</h2>
                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                  <p>Мой склад: <span className="font-medium text-foreground">{item.inventoryUsageCount}</span></p>
                  <p>Мои рецепты: <span className="font-medium text-foreground">{item.recipeUsageCount}</span></p>
                </div>
              </section>
            ) : null}

            {canManage ? (
              <section className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Где купить</h2>
                <div className="mt-4">
                  <IngredientPurchaseLinksEditor
                    reference={{
                      source: item.source,
                      id: item.id
                    }}
                    initialLinks={item.purchaseLinks}
                  />
                </div>
              </section>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="max-w-2xl">{leftColumn}</div>
      )}

      {/* JSON-LD в конце main: первым ребёнком <script> участвует в space-y-6
          и сдвигает контент на 24px относительно страниц без него. */}
      {jsonLd ? <script {...jsonLdScriptProps(jsonLd)} /> : null}
    </main>
  );
}
