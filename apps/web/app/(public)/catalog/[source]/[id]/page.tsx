import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteCustomCatalogIngredientButton } from "@/components/ingredients/delete-custom-catalog-ingredient-button";
import { IngredientFavoriteToggle } from "@/components/ingredients/ingredient-favorite-toggle";
import { IngredientPurchaseLinksEditor } from "@/components/ingredients/ingredient-purchase-links-manager";
import { CountryFlagLabel } from "@/components/shared/country-flag";
import { getUserCatalogIngredientByRef } from "@/features/ingredients/catalog-service";
import { buildIngredientCatalogActionHref } from "@/features/ingredients/catalog-links";
import type { IngredientTechnicalData } from "@/features/ingredients/contracts";
import {
  formatIngredientSubtypeLabel,
  resolveIngredientBrandLabel,
  resolveIngredientCountry,
  resolveIngredientFermentableKindLabel,
  type ResolvedIngredientCountry
} from "@/features/ingredients/presentation";
import {
  resolveIngredientTechnicalDataColorRangeEbc,
  sanitizeIngredientColorValue
} from "@/features/ingredients/technical-fields";
import { getSessionUser } from "@/lib/auth";

const formatValue = (value: number) => value % 1 === 0 ? String(value) : value.toFixed(1).replace(/\.0$/, "");

const resolveFermentableColor = (item: NonNullable<Awaited<ReturnType<typeof getUserCatalogIngredientByRef>>>) => {
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

const buildPrimaryFacts = (item: NonNullable<Awaited<ReturnType<typeof getUserCatalogIngredientByRef>>>) => {
  const facts: Array<{ label: string; value: string }> = [];
  const color = resolveFermentableColor(item);

  if (item.category === "hop") {
    if (item.hopAlphaAcidPct != null) {
      facts.push({ label: "Альфа-кислота", value: `${formatValue(item.hopAlphaAcidPct)}%` });
    }
    if (item.hopBetaAcidPct != null) {
      facts.push({ label: "Бета-кислота", value: `${formatValue(item.hopBetaAcidPct)}%` });
    }
    if (item.hopForm) {
      facts.push({ label: "Форма", value: item.hopForm.replaceAll("_", " ") });
    }
  }

  if (item.category === "fermentable") {
    if (color) {
      facts.push({ label: "Цвет", value: color });
    }
    if (item.fermentableExtractYieldPct != null) {
      facts.push({ label: "Экстрактивность", value: `${formatValue(item.fermentableExtractYieldPct)}%` });
    }
    if (item.technicalData && item.technicalData.type === "malt" && item.technicalData.proteinPct != null) {
      const malt = item.technicalData as Extract<IngredientTechnicalData, { type: "malt" }>;
      facts.push({ label: "Белок", value: `${formatValue(malt.proteinPct ?? 0)}%` });
    }
  }

  if (item.category === "yeast") {
    if (item.yeastAttenuationPct != null) {
      facts.push({ label: "Аттенюация", value: `${formatValue(item.yeastAttenuationPct)}%` });
    }
    if (item.yeastMinFermentationTempC != null || item.yeastMaxFermentationTempC != null) {
      facts.push({
        label: "Температура",
        value: `${item.yeastMinFermentationTempC ?? "?"}-${item.yeastMaxFermentationTempC ?? "?"} °C`
      });
    }
    if (item.technicalData && item.technicalData.type === "yeast" && item.technicalData.flocculation) {
      const yeast = item.technicalData as Extract<IngredientTechnicalData, { type: "yeast" }>;
      facts.push({ label: "Флокуляция", value: yeast.flocculation ?? "" });
    }
  }

  if ((item.category === "consumable" || item.category === "water_treatment") && item.unitPreferred) {
    facts.push({ label: "Единица", value: item.unitPreferred });
  }

  return facts.slice(0, 4);
};

type TechnicalRow =
  | { label: string; kind: "text"; value: string }
  | { label: string; kind: "country"; country: ResolvedIngredientCountry };

const renderTechnicalRows = (item: NonNullable<Awaited<ReturnType<typeof getUserCatalogIngredientByRef>>>) => {
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
  if (color) {
    rows.push({ label: "Цвет", kind: "text", value: color });
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
    rows.push({ label: "Флокуляция", kind: "text", value: yeast.flocculation ?? "" });
  }

  return rows;
};

export default async function IngredientDetailPage({
  params
}: {
  params: Promise<{ source: string; id: string }>;
}) {
  const user = await getSessionUser();
  const userId = user?.id ?? null;
  const canManage = Boolean(userId);
  const { source, id } = await params;
  const resolvedSource = source === "custom" ? "custom" : source === "system" ? "catalog" : null;

  if (!resolvedSource) {
    notFound();
  }

  const item = await getUserCatalogIngredientByRef(userId, resolvedSource, id);
  if (!item) {
    notFound();
  }

  const technicalRows = renderTechnicalRows(item);
  const primaryFacts = buildPrimaryFacts(item);
  const typeLabel = item.category === "fermentable"
    ? (item.subtype === "malt" ? "Солод" : resolveIngredientFermentableKindLabel(item) ?? "Сбраживаемое сырье")
    : formatIngredientSubtypeLabel(item.category, item.subtype);
  const subtleAliases = Array.from(new Set(item.aliases.map((alias) => alias.alias).filter(Boolean)));
  const brandLabel = resolveIngredientBrandLabel(item);
  const metaBadges = Array.from(new Set([
    typeLabel,
    brandLabel
  ].filter(Boolean)));
  const country = resolveIngredientCountry(item);
  const loginHref = `/login?next=${encodeURIComponent(`/catalog/${source}/${id}`)}`;

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
        <Link href="/catalog" className="hover:text-zinc-700">Каталог ингредиентов</Link>
        <span>/</span>
        <span>{item.primaryLabelRu}</span>
      </div>

      <section className="rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{item.primaryLabelRu}</h1>
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
              {item.source === "custom" ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-200">
                  СВОЙ
                </span>
              ) : (
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
                  Системный
                </span>
              )}
            </div>

            {item.secondaryLabelRu ? <p className="text-sm text-zinc-500">{item.secondaryLabelRu}</p> : null}

            <div className="flex flex-wrap gap-2">
              {metaBadges.map((badge) => (
                <span key={badge} className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700">
                  {badge}
                </span>
              ))}
              {country ? (
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700">
                  <CountryFlagLabel
                    countryCode={country.code}
                    label={country.label}
                    iconClassName="h-3.5 w-[1.1rem]"
                    className="gap-1.5"
                  />
                </span>
              ) : null}
            </div>

            {item.derivedFromDisplayName ? (
              <p className="text-sm text-zinc-600">
                Основан на системном ингредиенте <strong>{item.derivedFromDisplayName}</strong>.
              </p>
            ) : null}

            {item.notes ? (
              <div className="rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
                {item.notes}
              </div>
            ) : null}

            {primaryFacts.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {primaryFacts.map((fact) => (
                  <div key={fact.label} className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
                    <p className="text-xs text-zinc-500">{fact.label}</p>
                    <p className="mt-2 text-lg font-semibold text-zinc-950">{fact.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {canManage ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:w-[360px]">
              <Link href={buildIngredientCatalogActionHref("/app/ingredients", item.source, item.id)} className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white">
                Добавить на склад
              </Link>
              <Link href={buildIngredientCatalogActionHref("/app/recipes/new", item.source, item.id)} className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50">
                Использовать в рецепте
              </Link>
              {item.source === "catalog" ? (
                <Link href={`/catalog/new?derivedFrom=${item.id}`} className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 sm:col-span-2">
                  Создать свой вариант
                </Link>
              ) : (
                <>
                  <Link href={`/catalog/custom/${item.id}/edit`} className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50">
                    Редактировать
                  </Link>
                  <DeleteCustomCatalogIngredientButton
                    ingredientId={item.id}
                    displayName={item.primaryLabelRu}
                    redirectHref="/catalog?view=mine"
                    label="Удалить"
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-200 bg-white px-4 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-60"
                  />
                </>
              )}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:w-[360px]">
              <Link href={loginHref} className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white">
                Добавить на склад
              </Link>
              <Link href={loginHref} className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50">
                Использовать в рецепте
              </Link>
              <Link href={loginHref} className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 sm:col-span-2">
                Создать свой вариант
              </Link>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <section className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-500">Параметры</h2>
            <div className="mt-4 space-y-3">
              {technicalRows.length ? technicalRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-50 px-4 py-3">
                  <span className="text-sm text-zinc-500">{row.label}</span>
                  {row.kind === "country" ? (
                    <CountryFlagLabel
                      countryCode={row.country.code}
                      label={row.country.label}
                      iconClassName="h-3.5 w-[1.1rem]"
                      className="gap-1.5 text-sm font-medium text-zinc-900"
                    />
                  ) : (
                    <span className="text-sm font-medium text-zinc-900">{row.value}</span>
                  )}
                </div>
              )) : (
                <p className="text-sm text-zinc-500">Для этого ингредиента пока не заполнены ключевые технические поля.</p>
              )}
            </div>
          </section>

          {canManage ? (
            <section className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-500">Использование</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">Мой склад</p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-950">{item.inventoryUsageCount}</p>
                  <p className="mt-1 text-sm text-zinc-500">{item.inventoryInUse ? "Используется в остатках" : "Пока не используется"}</p>
                </div>
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">Мои рецепты</p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-950">{item.recipeUsageCount}</p>
                  <p className="mt-1 text-sm text-zinc-500">{item.recipeInUse ? "Уже выбран в рецептах" : "Пока не используется"}</p>
                </div>
              </div>
            </section>
          ) : null}

          {canManage ? (
            <section className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-500">Где купить</h2>
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

      {subtleAliases.length ? (
        <section className="rounded-[24px] border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
            {subtleAliases.map((alias) => (
              <span key={alias} className="rounded-full bg-zinc-100 px-2.5 py-1">
                {alias}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
