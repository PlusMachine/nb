import React from "react";
import Link from "next/link";
import { Boxes, Pencil } from "lucide-react";

import { DeleteCustomCatalogIngredientButton } from "@/components/ingredients/delete-custom-catalog-ingredient-button";
import { IngredientFavoriteToggle } from "@/components/ingredients/ingredient-favorite-toggle";
import {
  IngredientColorSwatch,
  resolveIngredientColorAccent,
  type IngredientColorAccent
} from "@/components/ingredients/ingredient-color-swatch";
import { CountryFlagLabel } from "@/components/shared/country-flag";
import {
  type IngredientTechnicalData,
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
import { buildIngredientCatalogActionHref } from "@/features/ingredients/catalog-links";

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

type CatalogItemsListProps = {
  items: UserCatalogIngredientDto[];
  hideSubtypeBadge: boolean;
  canManage: boolean;
};

// Переиспользуемый рендер строк каталога (desktop-таблица + mobile-карточки,
// переключение через CSS) — общий для хаба `/catalog` и категорийных лендингов.
export const CatalogItemsList = ({ items, hideSubtypeBadge, canManage }: CatalogItemsListProps) => (
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
          {items.map((item) => {
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
                        <IngredientNameBadges item={item} canManage={canManage} hideSubtypeBadge={hideSubtypeBadge} />
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
      {items.map((item) => {
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
                  <IngredientNameBadges item={item} canManage={canManage} hideSubtypeBadge={hideSubtypeBadge} />
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
  </>
);
