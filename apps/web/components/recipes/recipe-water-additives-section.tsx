"use client";

import { Plus, X } from "lucide-react";
import React from "react";

import {
  getRecipeWaterAdditivesStockAction,
  type RecipeWaterAdditivesStockResult
} from "@/app/(app)/app/recipes/actions";
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
export type RecipeWaterAdditiveTarget = "all" | "mash" | "sparge";
type AdditiveTarget = RecipeWaterAdditiveTarget;
type AcidTarget = "mash" | "sparge";
type SaltId = SaltAddition["salt"];

export type RecipeWaterAdditiveRow = {
  key: string;
  kind: "salt" | "acid";
  saltId: SaltId | null;
  catalogIngredientId: string | null;
  title: string;
  formula: string;
  concentrationPct: number | null;
  amountText: string;
  amountValue: number | null;
  target: AdditiveTarget | null;
  saltTarget: AdditiveTarget | null;
  removable: boolean;
  manualSaltIndex: number | null;
  acidTarget: AcidTarget | null;
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
    saltId: null,
    catalogIngredientId:
      recipeWaterAcidCatalogIds[acidId as keyof typeof recipeWaterAcidCatalogIds] ?? null,
    title: presentation?.label ?? addition.label ?? acidId,
    formula: formatPercent(addition.concentrationPct),
    concentrationPct: addition.concentrationPct,
    amountText: formatMl(ml),
    amountValue: ml,
    target: showTarget ? variant : null,
    saltTarget: null,
    removable: true,
    manualSaltIndex: null,
    acidTarget: variant,
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
        saltId: addition.salt as SaltId,
        catalogIngredientId:
          recipeWaterSaltCatalogIds[addition.salt as keyof typeof recipeWaterSaltCatalogIds] ?? null,
        title: presentation?.label ?? addition.salt,
        formula: presentation?.formula ?? "",
        concentrationPct: null,
        amountText: formatGrams(addition.grams),
        amountValue: addition.grams,
        target: isSplit ? addition.target ?? "all" : null,
        saltTarget: addition.target ?? "all",
        removable: true,
        manualSaltIndex: index,
        acidTarget: null,
      });
    });

    const mashAcid = buildAcidRow(waterPlanResult.mashAcidAddition, "mash", showTarget);
    if (mashAcid) {
      rows.push(mashAcid);
    }

    const spargeAcid = buildAcidRow(waterPlanResult.spargeAcidAddition, "sparge", showTarget);
    if (spargeAcid) {
      rows.push(spargeAcid);
    }
  }

  return rows;
};

export const groupRecipeWaterAdditiveRows = (
  rows: RecipeWaterAdditiveRow[],
  isSplit: boolean,
) => {
  if (!rows.length) {
    return [];
  }

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

const resultIonKeys = ["ca", "mg", "na", "cl", "so4", "hco3"] as const;

const resultIonLabels: Record<(typeof resultIonKeys)[number], string> = {
  ca: "Ca",
  mg: "Mg",
  na: "Na",
  cl: "Cl",
  so4: "SO4",
  hco3: "HCO3",
};

const hasMeaningfulProfile = (
  profile: RecipeWaterPlanResult["finalProfile"] | null | undefined,
) => Boolean(profile && resultIonKeys.some((key) => profile[key] > 0));

const formatResultIonValue = (value: number) =>
  Number.isFinite(value) ? Math.round(value).toString() : "0";

const formatResultIonDelta = (
  value: number,
  target: number | null | undefined,
) => {
  if (target == null || !Number.isFinite(value) || !Number.isFinite(target)) {
    return null;
  }

  const delta = value - target;
  if (Math.abs(delta) < 0.5) {
    return "0";
  }

  return `${delta > 0 ? "+" : "-"}${Math.round(Math.abs(delta))}`;
};

const shouldShowWaterResultSummary = (
  waterPlanMeta: RecipeWaterPlanMeta,
  rows: RecipeWaterAdditiveRow[],
) => waterPlanMeta.setupEnabled && rows.length > 0;

function WaterResultSummary({
  waterPlanResult,
  withDivider,
}: {
  waterPlanResult: RecipeWaterPlanResult;
  withDivider: boolean;
}) {
  const finalProfile = waterPlanResult.finalProfile;
  const targetProfile = waterPlanResult.targetProfile;
  const hasTargetProfile = hasMeaningfulProfile(targetProfile);

  return (
    <section className={withDivider ? "border-t border-border pt-3" : ""}>
      <div className="min-w-0">
        <h4 className="text-sm font-semibold text-foreground">
          Итоговый профиль воды
        </h4>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {resultIonKeys.map((key) => {
          const value = finalProfile[key];
          const delta = formatResultIonDelta(value, targetProfile?.[key]);
          const isOverTarget = delta != null && delta.startsWith("+");
          const isUnderTarget = delta != null && delta.startsWith("-");

          return (
            <div key={key} className="rounded-md bg-muted px-2 py-1.5">
              <div className="text-[11px] font-medium uppercase text-muted-foreground">
                {resultIonLabels[key]}
              </div>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {formatResultIonValue(value)}
                </span>
                <span className="text-[10px] text-muted-foreground">ppm</span>
              </div>
              {hasTargetProfile && delta != null ? (
                <div
                  className={`mt-0.5 text-[10px] tabular-nums ${isOverTarget
                    ? "text-warning-subtle-foreground"
                    : isUnderTarget
                      ? "text-link"
                      : "text-success"
                  }`}
                  aria-label={`Отклонение от цели: ${delta} ppm`}
                >
                  к цели {delta}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

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
  onUpdateManualSalt: (
    index: number,
    patch: Partial<{ grams: number; target: AdditiveTarget }>,
  ) => void;
  onRemoveManualSalt: (index: number) => void;
  onAddManualSalt?: () => void;
  onApplyAcidConcentration?: (concentrationPct: number) => void;
};

export const getRecipeWaterSetupToggleLabel = (setupOpen: boolean) =>
  setupOpen ? "Скрыть настройку" : "Настроить воду";

export function RecipeWaterAdditivesSection({
  waterPlanMeta,
  waterPlanResult,
  onUpdateManualSalt,
  onRemoveManualSalt,
  onAddManualSalt,
  onApplyAcidConcentration,
}: RecipeWaterAdditivesSectionProps) {
  const isSplit = waterPlanResult.waterVolumes.source === "manual_split";
  const rows = React.useMemo(
    () => buildAdditiveRows(waterPlanMeta, waterPlanResult, isSplit),
    [isSplit, waterPlanMeta, waterPlanResult],
  );
  const rowGroups = React.useMemo(
    () => groupRecipeWaterAdditiveRows(rows, isSplit),
    [isSplit, rows],
  );
  const showResultSummary = shouldShowWaterResultSummary(
    waterPlanMeta,
    rows,
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

  if (!waterPlanMeta.setupEnabled) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
        Нет добавок воды
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">
            Добавки воды
          </h3>
          {onAddManualSalt ? (
            <button
              type="button"
              onClick={onAddManualSalt}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-border hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              Добавить соль
            </button>
          ) : null}
        </div>
        {rowGroups.length ? rowGroups.map((group) => (
          <section key={group.key} className="space-y-2">
            {group.label ? (
              <h4 className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
                const isManualSalt =
                  row.kind === "salt" && row.manualSaltIndex != null;
                const canEditSalt = isManualSalt;
                const canRemoveManualSalt =
                  row.removable && row.manualSaltIndex != null;
                const canRemoveSalt = canRemoveManualSalt;

                return (
                  <li
                    key={row.key}
                    className="relative rounded-lg border-l-[3px] border-l-sky-400 bg-card px-3 py-2.5 shadow-sm ring-1 ring-ring"
                  >
                    {canRemoveSalt ? (
                      <div className="absolute right-2 top-2 z-10 flex shrink-0 gap-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (canRemoveManualSalt) {
                              onRemoveManualSalt(row.manualSaltIndex!);
                              return;
                            }
                          }}
                          className="relative rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive-subtle hover:text-destructive before:absolute before:-inset-2.5 before:content-['']"
                          aria-label={`Удалить ${row.title}`}
                          title="Удалить"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}

                    <div className={`flex min-w-0 items-start gap-3 ${canRemoveSalt ? "pr-10" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {row.title}
                          </span>
                          {row.formula ? (
                            <span className="text-sm font-semibold tabular-nums text-foreground">
                              {row.formula}
                            </span>
                          ) : null}
                          {row.kind === "acid" ? (
                            <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                              pH-коррекция
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs">
                          {row.catalogIngredientId ? (
                            stockLoading && !stock ? (
                              <span className="text-muted-foreground">Проверка склада…</span>
                            ) : hasStock && stock ? (
                              <span className="text-success">
                                На складе: {formatStockQuantity(stock)}
                              </span>
                            ) : row.kind === "acid" && availableAcidConcentrations ? (
                              <span className="text-warning-subtle-foreground">
                                На складе: {availableAcidConcentrations}, выбрано {row.formula}
                              </span>
                            ) : (
                              <span className="text-warning-subtle-foreground">Нет на складе</span>
                            )
                          ) : (
                            <span className="text-muted-foreground">Не привязано к каталогу</span>
                          )}
                        </div>
                      </div>
                      <div className={`shrink-0 text-right ${canRemoveSalt ? "pt-6" : ""}`}>
                        {canEditSalt ? (
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <label className="sr-only" htmlFor={`${row.key}-grams`}>
                              Количество {row.title}, г
                            </label>
                            <input
                              id={`${row.key}-grams`}
                              type="number"
                              min={0}
                              step={0.01}
                              value={row.amountValue ?? 0}
                              onChange={(event) => {
                                const grams = Number(event.target.value || 0);
                                if (isManualSalt) {
                                  onUpdateManualSalt(row.manualSaltIndex!, { grams });
                                  return;
                                }
                              }}
                              className="h-9 w-20 rounded-md border border-border bg-muted px-2 text-right text-sm font-semibold tabular-nums text-foreground focus:border-ring focus:bg-card focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            <span className="text-xs text-muted-foreground">г</span>
                          </div>
                        ) : (
                          <div className="text-sm font-semibold tabular-nums text-foreground">
                            {row.amountText}
                          </div>
                        )}
                        {canEditSalt && isSplit && row.target ? (
                          <select
                            aria-label={`Куда добавить ${row.title}`}
                            value={row.target}
                            onChange={(event) => {
                              const target = event.target.value as AdditiveTarget;
                              if (isManualSalt) {
                                onUpdateManualSalt(row.manualSaltIndex!, { target });
                                return;
                              }
                            }}
                            className="mt-1 h-8 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground"
                          >
                            {Object.entries(groupLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
            Нет добавок воды
          </div>
        )}
        {showResultSummary ? (
          <WaterResultSummary
            waterPlanResult={waterPlanResult}
            withDivider={rows.length > 0}
          />
        ) : null}
      </div>
    </div>
  );
}
