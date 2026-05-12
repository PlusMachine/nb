"use client";

import { Pencil, SlidersHorizontal, Trash2 } from "lucide-react";
import React from "react";

import {
  getRecipeWaterAdditivesStockAction,
  type RecipeWaterAdditivesStockResult
} from "@/app/(app)/app/recipes/actions";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import type { RecipeWaterPlanMeta } from "@/features/recipes/contracts";
import {
  recipeWaterAcidPresentation,
  recipeWaterSaltPresentation,
  type RecipeWaterPlanResult
} from "@/features/recipes/water-plan";
import {
  recipeWaterAcidCatalogIds,
  recipeWaterSaltCatalogIds
} from "@/features/recipes/water-additives-catalog";
import type {
  RecipeWaterAdditiveStockRequirement,
  RecipeWaterAdditiveStockStatusDto
} from "@/features/recipes/water-additives-service";
import { waterTreatmentConcentrationsEqual } from "@/features/ingredients/water-treatment";

type SaltAddition = RecipeWaterPlanResult["mashSaltAdditions"][number];
type AcidAddition = NonNullable<RecipeWaterPlanResult["mashAcidAddition"]>;
type SpargeAcidAddition = NonNullable<RecipeWaterPlanResult["spargeAcidAddition"]>;
type AdditiveTarget = "all" | "mash" | "sparge";

export type RecipeWaterAdditiveRow = {
  key: string;
  kind: "salt" | "acid";
  catalogIngredientId: string | null;
  title: string;
  formula: string;
  concentrationPct: number | null;
  amountText: string;
  target: AdditiveTarget | null;
  editable: boolean;
  removable: boolean;
  manualSaltIndex: number | null;
};

const groupLabels: Record<AdditiveTarget, string> = {
  all: "Весь объем",
  mash: "Затор",
  sparge: "Промывка",
};

const formatGrams = (grams: number): string => {
  if (!Number.isFinite(grams) || grams <= 0) {
    return "0 г";
  }

  return `${grams.toFixed(grams >= 10 ? 1 : 2)} г`;
};

const formatMl = (ml: number): string => {
  if (!Number.isFinite(ml) || ml <= 0) {
    return "0 мл";
  }

  return `${ml.toFixed(ml >= 10 ? 1 : 2)} мл`;
};

const formatPercent = (pct: number): string => {
  if (!Number.isFinite(pct) || pct <= 0) {
    return "";
  }

  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
};

const defaultRecipeWaterAcidConcentrationPct = (
  acid: RecipeWaterPlanMeta["selectedAcid"],
) => (acid === "phosphoric_acid" ? 85 : 88);

const formatStockQuantity = (status: RecipeWaterAdditiveStockStatusDto): string => {
  const qty = status.availableNormalizedQuantity;
  if (!Number.isFinite(qty) || qty <= 0) {
    return "—";
  }

  if (status.normalizedUnit === "g") {
    if (qty >= 1000) {
      return `${(qty / 1000).toFixed(qty >= 10000 ? 0 : 2)} кг`;
    }
    return `${qty.toFixed(qty >= 10 ? 0 : 1)} г`;
  }

  if (status.normalizedUnit === "ml") {
    if (qty >= 1000) {
      return `${(qty / 1000).toFixed(qty >= 10000 ? 0 : 2)} л`;
    }
    return `${qty.toFixed(qty >= 10 ? 0 : 1)} мл`;
  }

  return `${qty} ${status.normalizedUnit ?? ""}`.trim();
};

const buildSaltRow = (
  addition: SaltAddition,
  source: "total" | "mash" | "sparge",
  index: number,
  showTarget: boolean,
): RecipeWaterAdditiveRow => {
  const presentation = recipeWaterSaltPresentation[addition.salt as keyof typeof recipeWaterSaltPresentation];
  const target = showTarget
    ? (source === "mash" ? "mash" : source === "sparge" ? "sparge" : "all")
    : null;

  return {
    key: `salt-${source}-${addition.salt}-${addition.target}-${index}`,
    kind: "salt",
    catalogIngredientId:
      recipeWaterSaltCatalogIds[addition.salt as keyof typeof recipeWaterSaltCatalogIds] ?? null,
    title: presentation?.label ?? addition.label ?? addition.salt,
    formula: presentation?.formula ?? addition.formula ?? "",
    concentrationPct: null,
    amountText: formatGrams(addition.grams),
    target,
    editable: true,
    removable: false,
    manualSaltIndex: null,
  };
};

const buildAcidRow = (
  addition: AcidAddition | SpargeAcidAddition | null,
  variant: "mash" | "sparge",
  showTarget: boolean,
): RecipeWaterAdditiveRow | null => {
  if (!addition) {
    return null;
  }

  const ml = "spargeAcidMl" in addition ? addition.spargeAcidMl : addition.mashAcidMl;
  if (!Number.isFinite(ml) || ml <= 0) {
    return null;
  }

  const acidId = addition.acid as keyof typeof recipeWaterAcidPresentation;
  const presentation = recipeWaterAcidPresentation[acidId];

  return {
    key: `acid-${variant}`,
    kind: "acid",
    catalogIngredientId:
      recipeWaterAcidCatalogIds[acidId as keyof typeof recipeWaterAcidCatalogIds] ?? null,
    title: presentation?.label ?? addition.label ?? acidId,
    formula: formatPercent(addition.concentrationPct),
    concentrationPct: addition.concentrationPct,
    amountText: formatMl(ml),
    target: showTarget ? variant : null,
    editable: true,
    removable: false,
    manualSaltIndex: null,
  };
};

const buildAdditiveRows = (
  waterPlanMeta: RecipeWaterPlanMeta,
  waterPlanResult: RecipeWaterPlanResult,
  isSplit: boolean,
): RecipeWaterAdditiveRow[] => {
  const rows: RecipeWaterAdditiveRow[] = [];
  const showTarget = isSplit;

  if (waterPlanMeta.engine === "advanced_manual") {
    (waterPlanMeta.manualSaltAdditions ?? []).forEach((addition, index) => {
      if (addition.grams <= 0) {
        return;
      }

      const presentation = recipeWaterSaltPresentation[addition.salt as keyof typeof recipeWaterSaltPresentation];
      rows.push({
        key: `manual-salt-${index}`,
        kind: "salt",
        catalogIngredientId:
          recipeWaterSaltCatalogIds[addition.salt as keyof typeof recipeWaterSaltCatalogIds] ?? null,
        title: presentation?.label ?? addition.salt,
        formula: presentation?.formula ?? "",
        concentrationPct: null,
        amountText: formatGrams(addition.grams),
        target: isSplit ? addition.target ?? "all" : null,
        editable: true,
        removable: true,
        manualSaltIndex: index,
      });
    });
  } else if (showTarget) {
    waterPlanResult.mashSaltAdditions.forEach((addition, index) => {
      if (addition.grams > 0) {
        rows.push(buildSaltRow(addition, "mash", index, true));
      }
    });
    waterPlanResult.spargeSaltAdditions.forEach((addition, index) => {
      if (addition.grams > 0) {
        rows.push(buildSaltRow(addition, "sparge", index, true));
      }
    });
  } else {
    waterPlanResult.totalSaltAdditions.forEach((addition, index) => {
      if (addition.grams > 0) {
        rows.push(buildSaltRow(addition, "total", index, false));
      }
    });
  }

  const mashAcid = buildAcidRow(waterPlanResult.mashAcidAddition, "mash", showTarget);
  if (mashAcid) {
    rows.push(mashAcid);
  }

  const spargeAcid = buildAcidRow(waterPlanResult.spargeAcidAddition, "sparge", showTarget);
  if (spargeAcid) {
    rows.push(spargeAcid);
  }

  return rows;
};

export const groupRecipeWaterAdditiveRows = (
  rows: RecipeWaterAdditiveRow[],
  isSplit: boolean,
) => {
  if (!isSplit) {
    return [{ key: "single", label: null, rows }];
  }

  return (["all", "mash", "sparge"] as const)
    .map((target) => ({
      key: target,
      label: groupLabels[target],
      rows: rows.filter((row) => row.target === target),
    }))
    .filter((group) => group.rows.length > 0);
};

const buildStockRequirementKey = (
  requirement: RecipeWaterAdditiveStockRequirement,
) => [
  requirement.catalogIngredientId,
  requirement.kind ?? "",
  requirement.concentrationPct == null ? "" : String(Number(requirement.concentrationPct.toFixed(2))),
].join(":");

const buildStockRequirements = (
  rows: RecipeWaterAdditiveRow[],
): RecipeWaterAdditiveStockRequirement[] => {
  const seen = new Set<string>();
  const result: RecipeWaterAdditiveStockRequirement[] = [];

  for (const row of rows) {
    if (!row.catalogIngredientId) {
      continue;
    }

    const requirement: RecipeWaterAdditiveStockRequirement = {
      catalogIngredientId: row.catalogIngredientId,
      kind: row.kind,
      concentrationPct: row.kind === "acid" ? row.concentrationPct : null,
    };
    const key = buildStockRequirementKey(requirement);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(requirement);
  }

  return result;
};

const combineStockStatuses = (
  statuses: RecipeWaterAdditiveStockStatusDto[],
): RecipeWaterAdditiveStockStatusDto | null => {
  const availableStatuses = statuses.filter((status) => status.availableNormalizedQuantity > 0);
  if (!availableStatuses.length) {
    return null;
  }

  const [first] = availableStatuses;
  const canSum = availableStatuses.every((status) => status.normalizedUnit === first.normalizedUnit);

  return {
    ...first,
    availableNormalizedQuantity: canSum
      ? availableStatuses.reduce((sum, status) => sum + status.availableNormalizedQuantity, 0)
      : first.availableNormalizedQuantity,
  };
};

export const resolveRecipeWaterAdditiveStockStatus = (
  row: RecipeWaterAdditiveRow,
  statuses: RecipeWaterAdditiveStockStatusDto[],
) => {
  if (row.kind !== "acid") {
    return combineStockStatuses(statuses);
  }

  return combineStockStatuses(
    statuses.filter((status) => waterTreatmentConcentrationsEqual(
      status.concentrationPct,
      row.concentrationPct,
    )),
  );
};

const formatAvailableAcidConcentrations = (
  statuses: RecipeWaterAdditiveStockStatusDto[],
) => Array.from(new Set(
  statuses
    .filter((status) => status.availableNormalizedQuantity > 0)
    .map((status) => status.concentrationPct)
    .filter((pct): pct is number => typeof pct === "number" && Number.isFinite(pct))
    .map((pct) => formatPercent(pct)),
)).join(", ");

export const resolveRecipeWaterAcidStockConcentrationSuggestion = ({
  waterPlanMeta,
  statuses,
}: {
  waterPlanMeta: RecipeWaterPlanMeta;
  statuses: RecipeWaterAdditiveStockStatusDto[];
}): number | null => {
  if (waterPlanMeta.acidConcentrationPct != null) {
    return null;
  }

  const selectedAcid = waterPlanMeta.selectedAcid ?? "lactic_acid";
  const catalogIngredientId = recipeWaterAcidCatalogIds[selectedAcid];
  const uniqueConcentrations = Array.from(new Set(
    statuses
      .filter((status) => (
        status.catalogIngredientId === catalogIngredientId
        && status.availableNormalizedQuantity > 0
      ))
      .map((status) => status.concentrationPct)
      .filter((pct): pct is number => typeof pct === "number" && Number.isFinite(pct))
      .map((pct) => Number(pct.toFixed(2))),
  ));

  if (uniqueConcentrations.length !== 1) {
    return null;
  }

  const [stockConcentrationPct] = uniqueConcentrations;
  const currentConcentrationPct =
    waterPlanMeta.acidConcentrationPct ??
    defaultRecipeWaterAcidConcentrationPct(selectedAcid);

  return waterTreatmentConcentrationsEqual(stockConcentrationPct, currentConcentrationPct)
    ? null
    : stockConcentrationPct;
};

export type RecipeWaterAdditivesSectionProps = {
  waterPlanMeta: RecipeWaterPlanMeta;
  waterPlanResult: RecipeWaterPlanResult;
  setupOpen: boolean;
  onOpenSetup: () => void;
  onCloseSetup: () => void;
  onResetWater: () => void;
  onRemoveManualSalt: (index: number) => void;
  onApplyAcidConcentration?: (concentrationPct: number) => void;
};

export const getRecipeWaterSetupToggleLabel = (setupOpen: boolean) =>
  setupOpen ? "Скрыть настройку" : "Настроить воду";

export function RecipeWaterAdditivesSection({
  waterPlanMeta,
  waterPlanResult,
  setupOpen,
  onOpenSetup,
  onCloseSetup,
  onResetWater,
  onRemoveManualSalt,
  onApplyAcidConcentration,
}: RecipeWaterAdditivesSectionProps) {
  const [resetConfirmOpen, setResetConfirmOpen] = React.useState(false);
  const isSplit = waterPlanResult.waterVolumes.source === "manual_split";
  const rows = React.useMemo(
    () => buildAdditiveRows(waterPlanMeta, waterPlanResult, isSplit),
    [isSplit, waterPlanMeta, waterPlanResult],
  );
  const rowGroups = React.useMemo(
    () => groupRecipeWaterAdditiveRows(rows, isSplit),
    [isSplit, rows],
  );

  const stockRequirements = React.useMemo(() => {
    return buildStockRequirements(rows);
  }, [rows]);

  const stockRequirementsKey = React.useMemo(
    () => stockRequirements.map(buildStockRequirementKey).join("|"),
    [stockRequirements],
  );

  const [stockMap, setStockMap] = React.useState<
    Map<string, RecipeWaterAdditiveStockStatusDto[]>
  >(() => new Map());
  const [stockStatuses, setStockStatuses] = React.useState<RecipeWaterAdditiveStockStatusDto[]>([]);
  const [stockLoading, setStockLoading] = React.useState(false);

  React.useEffect(() => {
    if (!stockRequirements.length) {
      setStockMap(new Map());
      setStockStatuses([]);
      return;
    }

    let cancelled = false;
    setStockLoading(true);
    void (async () => {
      const result: RecipeWaterAdditivesStockResult =
        await getRecipeWaterAdditivesStockAction(stockRequirements);
      if (cancelled) {
        return;
      }

      if (result.ok) {
        const next = new Map<string, RecipeWaterAdditiveStockStatusDto[]>();
        for (const item of result.status) {
          const current = next.get(item.catalogIngredientId) ?? [];
          current.push(item);
          next.set(item.catalogIngredientId, current);
        }
        setStockMap(next);
        setStockStatuses(result.status);
      } else {
        setStockMap(new Map());
        setStockStatuses([]);
      }
      setStockLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockRequirementsKey]);

  React.useEffect(() => {
    const suggestedConcentrationPct = resolveRecipeWaterAcidStockConcentrationSuggestion({
      waterPlanMeta,
      statuses: stockStatuses,
    });
    if (suggestedConcentrationPct == null) {
      return;
    }

    onApplyAcidConcentration?.(suggestedConcentrationPct);
  }, [onApplyAcidConcentration, stockStatuses, waterPlanMeta]);

  if (!waterPlanMeta.setupEnabled || rows.length === 0) {
    return (
      <div className="p-4 sm:p-5">
        <button
          type="button"
          onClick={setupOpen ? onCloseSetup : onOpenSetup}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/40 px-4 py-6 text-sm text-zinc-600 transition-colors hover:border-sky-400 hover:bg-sky-50/40 hover:text-sky-700"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>{getRecipeWaterSetupToggleLabel(setupOpen)}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4">
      <ConfirmActionDialog
        open={resetConfirmOpen}
        title="Сбросить настройку воды?"
        description="Сбросятся источник, цель, объёмы и pH. Действие нельзя отменить."
        confirmLabel="Сбросить"
        cancelLabel="Отмена"
        onConfirm={() => {
          onResetWater();
          setResetConfirmOpen(false);
        }}
        onClose={() => setResetConfirmOpen(false)}
      />
      <div className="space-y-3">
        {rowGroups.map((group) => (
          <section key={group.key} className="space-y-2">
            {group.label ? (
              <h4 className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                {group.label}
              </h4>
            ) : null}
            <ul className="space-y-2">
              {group.rows.map((row) => {
                const stockStatusesForCatalogId = row.catalogIngredientId
                  ? stockMap.get(row.catalogIngredientId) ?? []
                  : [];
                const stock = resolveRecipeWaterAdditiveStockStatus(row, stockStatusesForCatalogId);
                const hasStock = Boolean(stock && stock.availableNormalizedQuantity > 0);
                const availableAcidConcentrations = row.kind === "acid"
                  ? formatAvailableAcidConcentrations(stockStatusesForCatalogId)
                  : "";

                return (
                  <li
                    key={row.key}
                    className="relative rounded-lg border-l-[3px] border-l-sky-400 bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="truncate text-sm font-semibold text-zinc-950">
                            {row.title}
                          </span>
                          {row.formula ? (
                            <span className="text-sm font-semibold tabular-nums text-zinc-950">
                              {row.formula}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs">
                          {row.catalogIngredientId ? (
                            stockLoading && !stock ? (
                              <span className="text-zinc-400">Проверка склада…</span>
                            ) : hasStock && stock ? (
                              <span className="text-emerald-700">
                                На складе: {formatStockQuantity(stock)}
                              </span>
                            ) : row.kind === "acid" && availableAcidConcentrations ? (
                              <span className="text-amber-700">
                                На складе: {availableAcidConcentrations}, выбрано {row.formula}
                              </span>
                            ) : (
                              <span className="text-amber-700">Нет на складе</span>
                            )
                          ) : (
                            <span className="text-zinc-400">Не привязано к каталогу</span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold tabular-nums text-zinc-950">
                          {row.amountText}
                        </div>
                        <div className="mt-1.5 flex justify-end gap-1">
                          {row.editable ? (
                            <button
                              type="button"
                              onClick={onOpenSetup}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-800"
                              aria-label={`Редактировать ${row.title}`}
                              title="Редактировать"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          {row.removable && row.manualSaltIndex != null ? (
                            <button
                              type="button"
                              onClick={() => onRemoveManualSalt(row.manualSaltIndex!)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-800"
                              aria-label={`Удалить ${row.title}`}
                              title="Удалить"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setResetConfirmOpen(true)}
          className="inline-flex h-9 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-800"
        >
          Сбросить воду
        </button>
      </div>
    </div>
  );
}
